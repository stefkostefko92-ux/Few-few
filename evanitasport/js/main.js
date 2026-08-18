// Evanita Sport
// Splash screen — само при първо посещение в сесията; уважава prefers-reduced-motion
(function(){
  var s=document.getElementById('splash');
  if(!s)return;
  var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen=false;
  try{seen=sessionStorage.getItem('evanita-splash')==='1';sessionStorage.setItem('evanita-splash','1')}catch(e){}
  if(reduced||seen){s.remove();return}
  setTimeout(function(){s.classList.add('hide')},1600);
  setTimeout(function(){s.remove()},2300);
})();
(function(){var n=document.getElementById('nav');window.addEventListener('scroll',function(){n.classList.toggle('scrolled',window.pageYOffset>30)},{passive:true})})();
(function(){if(!('IntersectionObserver' in window)){document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('in')});return}var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.05});document.querySelectorAll('.reveal').forEach(function(e){io.observe(e)})})();