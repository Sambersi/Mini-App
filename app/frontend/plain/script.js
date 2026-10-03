document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('modalClose');
  
    function openModal() {
      overlay.classList.add('active');
    }
  
    function closeModal() {
      overlay.classList.remove('active');
    }
  
    closeBtn.addEventListener('click', closeModal);
  
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });
  
    document.querySelectorAll('.currency-card__buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });
  
    document.querySelectorAll('.bonus-card__btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });
  
    document.querySelectorAll('.profile-card__help, .bonus-card__help').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    });
  
    const navItems = document.querySelectorAll('.bottom-nav__item');
    navItems.forEach(item => {
      item.querySelector('.bottom-nav__btn').addEventListener('click', () => {
        navItems.forEach(i => {
          const isActive = (i === item);
          i.classList.toggle('bottom-nav__item--active', isActive);
          const btn = i.querySelector('.bottom-nav__btn');
          btn.classList.toggle('bottom-nav__btn--active', isActive);
          i.querySelector('.bottom-nav__label').classList.toggle('bottom-nav__label--active', isActive);
          const img = btn.querySelector('img');
          if (img) {
            const name = i.getAttribute('data-nav');
            img.src = isActive ? `icons/${name}.svg` : `icons/${name}_off.svg`;
          }
        });
      });
    });
  });