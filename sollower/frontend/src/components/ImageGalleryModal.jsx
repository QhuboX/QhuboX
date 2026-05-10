// frontend/src/components/ImageGalleryModal.jsx
import React, { useState, useEffect } from 'react';

function ImageGalleryModal({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const [touchStart, setTouchStart] = useState(0);

  useEffect(() => {
    const handler = e => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const next = () => setIdx(i => (i + 1) % images.length);
  const prev = () => setIdx(i => (i - 1 + images.length) % images.length);

  return (
    <div className="gallery-overlay" onClick={onClose}>
      <button className="gallery-close-btn" onClick={onClose}>✕</button>
      <div className="gallery-counter">{idx + 1} / {images.length}</div>

      {images.length > 1 && (
        <>
          <button className="gallery-nav-btn prev" onClick={e => { e.stopPropagation(); prev(); }}>‹</button>
          <button className="gallery-nav-btn next" onClick={e => { e.stopPropagation(); next(); }}>›</button>
        </>
      )}

      <div
        onClick={e => e.stopPropagation()}
        onTouchStart={e => setTouchStart(e.targetTouches[0].clientX)}
        onTouchEnd={e => {
          const diff = touchStart - e.changedTouches[0].clientX;
          if (diff > 50) next();
          else if (diff < -50) prev();
        }}
      >
        <img className="gallery-img" src={images[idx]} alt={`Image ${idx + 1}`} />
      </div>

      {images.length > 1 && images.length <= 12 && (
        <div className="gallery-thumbs" onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <div key={i} className={`gallery-thumb${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)}>
              <img src={img} alt="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ImageGalleryModal;
