// Help.jsx
import React from 'react';
export default function Help() {
  return (
    <div className="page">
      <div className="card secondary">
        <div className="card-title">Валюты</div>
        <p className="text">PF — игровая валюта. DF — донатная валюта.</p>
      </div>
      <div className="card secondary">
        <div className="card-title">Поддержка</div>
        <p className="text">Команда «репорт [текст]» в боте — и админы ответят в течение суток.</p>
      </div>
    </div>
  );
}