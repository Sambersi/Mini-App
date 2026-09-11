import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { playTick, playWin } from '../utils/sound.js';

const PRIZES = [
  { title: '1 000 000 PF', img: '/fortune/pf.jpg', weight: 50 },
  { title: '50 звёзд', img: '/fortune/stars.jpg', weight: 20 },
  { title: 'Админ статус', img: '/fortune/admin.jpg', weight: 1 },
  { title: 'DIAMOND статус', img: '/fortune/diamond.jpg', weight: 2 },
  { title: 'Уникальная карта', img: '/fortune/skin.jpg', weight: 5000 },
  { title: '20 GOLD контейнеров', img: '/fortune/cont.jpg', weight: 10 },
  { title: 'Префикс FOTRUNA', img: '/fortune/prefix.jpg', weight: 2 },
  { title: 'СЕКРЕТНЫЙ ПРИЗ', img: '/fortune/pumpkin.jpg', weight: 10 },
];
const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);

const IMG_DEFAULT = '/fortune/default.jpg';
const IMG_ROTATING = '/fortune/rotating.jpg';
const IMG_FALLBACK = '/fortune/priz.jpg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickPrize() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const p of PRIZES) { r -= p.weight; if (r <= 0) return p; }
  return PRIZES[PRIZES.length - 1];
}

function formatPercent(weight) {
  const v = (weight / TOTAL_WEIGHT) * 100;
  return v < 0.01 ? '<0.01%' : v.toFixed(2) + '%';
}

export default function Fortune() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle'); // idle | spinning | result
  const [currentImg, setCurrentImg] = useState(IMG_DEFAULT);
  const [caption, setCaption] = useState('');
  const [result, setResult] = useState(null);
  const [showPrizes, setShowPrizes] = useState(false);

  const onImgError = (e) => {
    console.error('[IMG не загрузилась]:', e.target.src);
    if (!e.target.dataset.fallback) {
      e.target.dataset.fallback = '1';
      e.target.src = IMG_FALLBACK;
    }
  };

  const spin = async () => {
    if (phase === 'spinning') return;
    setPhase('spinning');
    setResult(null);
    setCaption('Колесо крутится...');
    setCurrentImg(IMG_ROTATING);
    playTick();
    await sleep(350);

    const steps = 8;
    for (let i = 0; i < steps; i++) {
      // Кадр "сектора" — случайный приз
      const fake = PRIZES[Math.floor(Math.random() * PRIZES.length)];
      setCurrentImg(fake.img);
      setCaption(i === steps - 1 ? 'Выпадает...' : `Могло выпасть: ${fake.title}`);
      playTick();
      await sleep(i < 4 ? 150 : i < 6 ? 350 : 650);

      // КОРОТКОЕ РАЗМЫТИЕ (rotating.jpg) МЕЖДУ СЕКТОРАМИ — динамика вращения
      if (i < steps - 1) {
        setCurrentImg(IMG_ROTATING);
        await sleep(i < 4 ? 90 : i < 6 ? 150 : 220);
      }
    }

    // Финальный "докрут" с размытием перед результатом
    setCurrentImg(IMG_ROTATING);
    setCaption('Выпадает...');
    await sleep(300);

    const prize = pickPrize();
    setCurrentImg(prize.img);
    setCaption('');
    setResult(prize);
    setPhase('result');
    playWin();
  };

  return (
    <div className="page fortune-page">
      {/* Крестик закрытия — справа сверху */}
      <button className="page-close" onClick={() => navigate('/profile')} aria-label="Закрыть">
        <span className="material-symbols-rounded">close</span>
      </button>

      <div className="page-mode-title">Колесо Фортуны</div>

      <div className="fortune-stage">
        <img
          key={currentImg + phase}
          src={currentImg}
          alt="Колесо фортуны"
          onError={onImgError}
          className={'fortune-wheel-img' + (phase === 'spinning' ? ' shaking' : '')}
        />
      </div>

      <div className="fortune-caption">
        {phase === 'result' && result ? `Вы выиграли: ${result.title}` : caption}
      </div>

      <div className="fortune-actions">
        <button className="btn-mini" onClick={() => setShowPrizes(true)}>
          Призы и шансы
        </button>
        <button className="btn fortune-spin-btn" onClick={spin} disabled={phase === 'spinning'}>
          {phase === 'spinning' ? 'Крутится...' : phase === 'result' ? 'Крутить ещё раз' : 'Крутить'}
        </button>
      </div>

      {/* Всплывающая вкладка «Призы и шансы» с крестиком справа сверху */}
      {showPrizes && (
        <div className="overlay">
          <div className="overlay-card">
            <button className="page-close" onClick={() => setShowPrizes(false)} aria-label="Закрыть">
              <span className="material-symbols-rounded">close</span>
            </button>
            <div className="overlay-title">Призы и шансы</div>
            <div className="overlay-list">
              {PRIZES.map((p, i) => (
                <div key={i} className="row">
                  <span>{p.title}</span>
                  <span className="val">{formatPercent(p.weight)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}