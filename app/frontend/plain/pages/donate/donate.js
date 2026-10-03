document.addEventListener('DOMContentLoaded', () => {
  const b = $('donate-open');
  if (b) b.addEventListener('click', () => alert('Донат открывается в боте: команда «донат».'));
});