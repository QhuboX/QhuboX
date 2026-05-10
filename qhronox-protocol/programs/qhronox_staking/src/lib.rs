use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("QHUBXstk11111111111111111111111111111111111");

pub const VAULT_SEED: &[u8]  = b"vault";
pub const STAKE_SEED: &[u8]  = b"stake";
pub const POOL_SEED: &[u8]   = b"pool";

pub const STAKERS_SHARE_BPS: u64  = 7000;
pub const TREASURY_SHARE_BPS: u64 = 2000;
pub const BURN_SHARE_BPS: u64     = 1000;

pub const MULTIPLIER_FLEXIBLE: u64 = 10_000;
pub const MULTIPLIER_3M: u64       = 15_000;
pub const MULTIPLIER_1Y: u64       = 30_000;

pub const LOCK_FLEXIBLE: i64 = 0;
pub const LOCK_3M: i64       = 90  * 24 * 3600;
pub const LOCK_1Y: i64       = 365 * 24 * 3600;

#[program]
pub mod qhronox_staking {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, treasury: Pubkey) -> Result<()> {
        let pool          = &mut ctx.accounts.pool;
        pool.authority    = ctx.accounts.authority.key();
        pool.mint         = ctx.accounts.mint.key();
        pool.vault        = ctx.accounts.vault.key();
        pool.treasury     = treasury;
        pool.total_staked = 0;
        pool.total_weighted = 0;
        pool.accumulated_rewards_per_weight = 0;
        pool.total_fees_collected = 0;
        pool.total_burned = 0;
        pool.bump         = *ctx.bumps.get("pool").unwrap();
        pool.vault_bump   = *ctx.bumps.get("vault").unwrap();
        emit!(PoolInitialized { authority: pool.authority, mint: pool.mint });
        Ok(())
    }

    pub fn deposit_fees(ctx: Context<DepositFees>, amount: u64) -> Result<()> {
        require!(amount > 0, QhronoXError::ZeroAmount);
        let pool = &mut ctx.accounts.pool;
        let stakers_amount = amount.checked_mul(STAKERS_SHARE_BPS).unwrap()
            .checked_div(10_000).unwrap();
        let burn_amount = amount.checked_mul(BURN_SHARE_BPS).unwrap()
            .checked_div(10_000).unwrap();

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from:      ctx.accounts.fee_source.to_account_info(),
                mint:      ctx.accounts.mint.to_account_info(),
                to:        ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.fee_authority.to_account_info(),
            },
        );
        token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        if pool.total_weighted > 0 {
            let reward_per_weight = stakers_amount
                .checked_mul(1_000_000_000).unwrap()
                .checked_div(pool.total_weighted).unwrap();
            pool.accumulated_rewards_per_weight = pool
                .accumulated_rewards_per_weight
                .checked_add(reward_per_weight).unwrap();
        }
        pool.total_fees_collected = pool.total_fees_collected.checked_add(amount).unwrap();
        pool.total_burned         = pool.total_burned.checked_add(burn_amount).unwrap();
        emit!(FeesDeposited { amount, stakers_share: stakers_amount, burn_amount });
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64, tier: u8) -> Result<()> {
        require!(amount > 0, QhronoXError::ZeroAmount);
        require!(tier <= 2,  QhronoXError::InvalidTier);

        let (multiplier, lock_duration) = match tier {
            0 => (MULTIPLIER_FLEXIBLE, LOCK_FLEXIBLE),
            1 => (MULTIPLIER_3M,       LOCK_3M),
            2 => (MULTIPLIER_1Y,       LOCK_1Y),
            _ => return Err(QhronoXError::InvalidTier.into()),
        };

        let clock      = Clock::get()?;
        let stake_info = &mut ctx.accounts.stake_info;
        let pool       = &mut ctx.accounts.pool;

        if stake_info.amount > 0 {
            let pending = calc_pending(stake_info, pool);
            stake_info.pending_rewards =
                stake_info.pending_rewards.checked_add(pending).unwrap();
            pool.total_weighted =
                pool.total_weighted.checked_sub(stake_info.weighted_amount).unwrap();
        }

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from:      ctx.accounts.user_token_account.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let new_total  = stake_info.amount.checked_add(amount).unwrap();
        let weighted   = new_total.checked_mul(multiplier).unwrap()
            .checked_div(10_000).unwrap();

        stake_info.owner           = ctx.accounts.user.key();
        stake_info.pool            = pool.key();
        stake_info.amount          = new_total;
        stake_info.weighted_amount = weighted;
        stake_info.multiplier      = multiplier;
        stake_info.tier            = tier;
        stake_info.staked_at       = clock.unix_timestamp;
        stake_info.unlock_at       = clock.unix_timestamp + lock_duration;
        stake_info.reward_debt     = pool.accumulated_rewards_per_weight;
        stake_info.bump            = *ctx.bumps.get("stake_info").unwrap();

        pool.total_staked   = pool.total_staked.checked_add(amount).unwrap();
        pool.total_weighted = pool.total_weighted.checked_add(weighted).unwrap();

        emit!(Staked {
            user: ctx.accounts.user.key(),
            amount, tier,
            unlock_at: stake_info.unlock_at,
            weighted_amount: weighted,
        });
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        require!(amount > 0, QhronoXError::ZeroAmount);
        let clock      = Clock::get()?;
        let stake_info = &mut ctx.accounts.stake_info;
        let pool       = &mut ctx.accounts.pool;

        require!(stake_info.owner == ctx.accounts.user.key(), QhronoXError::Unauthorized);
        require!(stake_info.amount >= amount,                 QhronoXError::InsufficientStake);
        require!(
            stake_info.tier == 0 || clock.unix_timestamp >= stake_info.unlock_at,
            QhronoXError::StillLocked
        );

        let pending = calc_pending(stake_info, pool);
        stake_info.pending_rewards =
            stake_info.pending_rewards.checked_add(pending).unwrap();

        pool.total_staked   = pool.total_staked.checked_sub(amount).unwrap();
        pool.total_weighted = pool.total_weighted.checked_sub(stake_info.weighted_amount).unwrap();

        let new_total = stake_info.amount.checked_sub(amount).unwrap();
        stake_info.amount = new_total;
        if new_total > 0 {
            stake_info.weighted_amount = new_total
                .checked_mul(stake_info.multiplier).unwrap()
                .checked_div(10_000).unwrap();
            pool.total_weighted =
                pool.total_weighted.checked_add(stake_info.weighted_amount).unwrap();
        } else {
            stake_info.weighted_amount = 0;
        }
        stake_info.reward_debt = pool.accumulated_rewards_per_weight;

        let pool_key = pool.key();
        let seeds    = &[VAULT_SEED, pool_key.as_ref(), &[pool.vault_bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from:      ctx.accounts.vault.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[&seeds[..]],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(Unstaked { user: ctx.accounts.user.key(), amount, remaining: new_total });
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info;
        let pool       = &mut ctx.accounts.pool;

        require!(stake_info.owner == ctx.accounts.user.key(), QhronoXError::Unauthorized);
        let pending       = calc_pending(stake_info, pool);
        let total_claimable = stake_info.pending_rewards.checked_add(pending).unwrap();
        require!(total_claimable > 0, QhronoXError::NoRewards);

        stake_info.pending_rewards = 0;
        stake_info.reward_debt     = pool.accumulated_rewards_per_weight;
        stake_info.total_claimed   =
            stake_info.total_claimed.checked_add(total_claimable).unwrap();

        let pool_key = pool.key();
        let seeds    = &[VAULT_SEED, pool_key.as_ref(), &[pool.vault_bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from:      ctx.accounts.vault.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[&seeds[..]],
            ),
            total_claimable,
            ctx.accounts.mint.decimals,
        )?;
        emit!(RewardsClaimed { user: ctx.accounts.user.key(), amount: total_claimable });
        Ok(())
    }
}

fn calc_pending(stake_info: &StakeInfo, pool: &Pool) -> u64 {
    if stake_info.weighted_amount == 0 { return 0; }
    let delta = pool.accumulated_rewards_per_weight
        .saturating_sub(stake_info.reward_debt);
    stake_info.weighted_amount
        .checked_mul(delta).unwrap_or(0)
        .checked_div(1_000_000_000).unwrap_or(0)
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = authority,
        space = 8 + Pool::LEN,
        seeds = [POOL_SEED, mint.key().as_ref()], bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init, payer = authority,
        token::mint = mint, token::authority = vault,
        seeds = [VAULT_SEED, pool.key().as_ref()], bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositFees<'info> {
    pub fee_authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, pool.key().as_ref()], bump = pool.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub fee_source: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, pool.key().as_ref()], bump = pool.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed, payer = user,
        space = 8 + StakeInfo::LEN,
        seeds = [STAKE_SEED, pool.key().as_ref(), user.key().as_ref()], bump
    )]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, pool.key().as_ref()], bump = pool.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [STAKE_SEED, pool.key().as_ref(), user.key().as_ref()], bump = stake_info.bump)]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, seeds = [VAULT_SEED, pool.key().as_ref()], bump = pool.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [STAKE_SEED, pool.key().as_ref(), user.key().as_ref()], bump = stake_info.bump)]
    pub stake_info: Account<'info, StakeInfo>,
    #[account(mut, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub mint:      Pubkey,
    pub vault:     Pubkey,
    pub treasury:  Pubkey,
    pub total_staked: u64,
    pub total_weighted: u64,
    pub accumulated_rewards_per_weight: u64,
    pub total_fees_collected: u64,
    pub total_burned: u64,
    pub bump: u8,
    pub vault_bump: u8,
}
impl Pool {
    pub const LEN: usize = 32*4 + 8*5 + 1*2;
}

#[account]
pub struct StakeInfo {
    pub owner:           Pubkey,
    pub pool:            Pubkey,
    pub amount:          u64,
    pub weighted_amount: u64,
    pub multiplier:      u64,
    pub tier:            u8,
    pub staked_at:       i64,
    pub unlock_at:       i64,
    pub reward_debt:     u64,
    pub pending_rewards: u64,
    pub total_claimed:   u64,
    pub bump:            u8,
}
impl StakeInfo {
    pub const LEN: usize = 32*2 + 8*7 + 8*2 + 1*2;
}

#[event] pub struct PoolInitialized  { pub authority: Pubkey, pub mint: Pubkey }
#[event] pub struct FeesDeposited    { pub amount: u64, pub stakers_share: u64, pub burn_amount: u64 }
#[event] pub struct Staked           { pub user: Pubkey, pub amount: u64, pub tier: u8, pub unlock_at: i64, pub weighted_amount: u64 }
#[event] pub struct Unstaked         { pub user: Pubkey, pub amount: u64, pub remaining: u64 }
#[event] pub struct RewardsClaimed   { pub user: Pubkey, pub amount: u64 }

#[error_code]
pub enum QhronoXError {
    #[msg("Amount must be greater than zero")]    ZeroAmount,
    #[msg("Invalid tier — must be 0, 1, or 2")]  InvalidTier,
    #[msg("Tokens are still locked")]             StillLocked,
    #[msg("Insufficient staked balance")]         InsufficientStake,
    #[msg("Unauthorized")]                        Unauthorized,
    #[msg("No rewards to claim")]                 NoRewards,
}