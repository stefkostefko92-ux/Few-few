// Evanita Sport
// Splash screen
(function(){var s=document.getElementById('splash');if(!s)return;setTimeout(function(){s.classList.add('hide')},2000);setTimeout(function(){s.remove()},2700)})();
(function(){var n=document.getElementById('nav');if(!n)return;window.addEventListener('scroll',function(){n.classList.toggle('scrolled',window.pageYOffset>30)},{passive:true})})();
(function(){if(!('IntersectionObserver' in window)){document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('in')});return}var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.05});document.querySelectorAll('.reveal').forEach(function(e){io.observe(e)})})();
// Google Maps — click-to-load (ePrivacy): iframe се създава САМО след клик.
// Изборът се помни в localStorage (функционален запис на съгласието, без бисквитки).
(function(){
  var f=document.getElementById('mapFacade');if(!f)return;
  function load(){
    var i=document.createElement('iframe');
    i.src=f.getAttribute('data-src');
    i.title='Карта — Evanita Sport, ул. Рилски Езера 1, Дупница';
    i.setAttribute('referrerpolicy','no-referrer');
    i.setAttribute('allowfullscreen','');
    i.loading='lazy';
    f.replaceWith(i);
    try{localStorage.setItem('evanita_map','1')}catch(e){}
  }
  try{if(localStorage.getItem('evanita_map')==='1'){load();return}}catch(e){}
  var b=document.getElementById('mapLoad');
  if(b)b.addEventListener('click',load);
})();
