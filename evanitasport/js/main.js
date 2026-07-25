// Evanita Sport
// Splash screen
(function(){var s=document.getElementById('splash');setTimeout(function(){s.classList.add('hide')},2000);setTimeout(function(){s.remove()},2700)})();
(function(){var n=document.getElementById('nav');window.addEventListener('scroll',function(){n.classList.toggle('scrolled',window.pageYOffset>30)},{passive:true})})();
(function(){if(!('IntersectionObserver' in window)){document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('in')});return}var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.05});document.querySelectorAll('.reveal').forEach(function(e){io.observe(e)})})();