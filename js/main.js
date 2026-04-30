/* =============================================
   다빈치랩 – Main JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. Header scroll effect ── */
  const header = document.getElementById('header');
  const onScroll = () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });


  /* ── 2. Scroll-to-top button ── */
  const scrollTopBtn = document.getElementById('scrollTop');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      scrollTopBtn?.classList.add('visible');
    } else {
      scrollTopBtn?.classList.remove('visible');
    }
  }, { passive: true });

  scrollTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  /* ── 3. Consult dropdown (header) ── */
  const consultToggle   = document.getElementById('consultToggle');
  const consultDropdown = document.getElementById('consultDropdown');
  const consultChevron  = document.getElementById('consultChevron');
  const consultBtnWrap  = document.getElementById('consultBtnWrap');

  consultToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = consultDropdown?.classList.toggle('open');
    consultChevron?.style.setProperty('transform', open ? 'rotate(180deg)' : 'rotate(0deg)');
    // close hero dropdown if open
    heroConsultDropdown?.classList.remove('open');
    heroChevron?.style.setProperty('transform', 'rotate(0deg)');
  });


  /* ── 4. Consult dropdown (hero) ── */
  const heroConsultToggle  = document.getElementById('heroConsultToggle');
  const heroConsultDropdown = document.getElementById('heroConsultDropdown');
  const heroChevron        = document.getElementById('heroChevron');

  heroConsultToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = heroConsultDropdown?.classList.toggle('open');
    heroChevron?.style.setProperty('transform', open ? 'rotate(180deg)' : 'rotate(0deg)');
    // close header dropdown if open
    consultDropdown?.classList.remove('open');
    consultChevron?.style.setProperty('transform', 'rotate(0deg)');
  });


  /* ── 5. Close dropdowns on outside click ── */
  document.addEventListener('click', (e) => {
    if (!consultBtnWrap?.contains(e.target)) {
      consultDropdown?.classList.remove('open');
      consultChevron?.style.setProperty('transform', 'rotate(0deg)');
    }
    const heroWrap = document.getElementById('heroConsultWrap');
    if (!heroWrap?.contains(e.target)) {
      heroConsultDropdown?.classList.remove('open');
      heroChevron?.style.setProperty('transform', 'rotate(0deg)');
    }
  });


  /* ── 6. Floating consult button ── */
  const floatBtnToggle = document.getElementById('floatBtnToggle');
  const floatMenu      = document.getElementById('floatMenu');

  floatBtnToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    floatMenu?.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    const floatingConsult = document.getElementById('floatingConsult');
    if (!floatingConsult?.contains(e.target)) {
      floatMenu?.classList.remove('open');
    }
  });


  /* ── 7. Mobile navigation ── */
  const hamburger          = document.getElementById('hamburger');
  const mobileNavOverlay   = document.getElementById('mobileNavOverlay');
  const mobileNavClose     = document.getElementById('mobileNavClose');
  const mobileNavLinks     = document.querySelectorAll('.mobile-nav-link');

  const openMobileNav = () => {
    mobileNavOverlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeMobileNav = () => {
    mobileNavOverlay?.classList.remove('open');
    document.body.style.overflow = '';
  };

  hamburger?.addEventListener('click', openMobileNav);
  mobileNavClose?.addEventListener('click', closeMobileNav);
  mobileNavOverlay?.addEventListener('click', (e) => {
    if (e.target === mobileNavOverlay) closeMobileNav();
  });

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', closeMobileNav);
  });


  /* ── 8. "상담하기" buttons on program cards ── */
  document.querySelectorAll('.consult-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // scroll to CTA and pulse
      const cta = document.querySelector('.cta-section');
      if (cta) {
        cta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cta.style.transition = 'box-shadow 0.3s';
        cta.style.boxShadow = '0 0 0 4px rgba(127,200,169,.4)';
        setTimeout(() => { cta.style.boxShadow = ''; }, 1200);
      }
    });
  });


  /* ── 9. 스크롤 애니메이션 – 모든 요소 즉시 표시 ── */
  document.querySelectorAll('[data-animate]').forEach(el => {
    el.classList.add('is-visible');
  });


  /* ── 10. Smooth anchor scroll (nav links) ── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const headerH = header?.offsetHeight || 68;
      const top = target.getBoundingClientRect().top + window.scrollY - headerH - 20;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });


  /* ── 11. Chevron transition style ── */
  const addChevronStyle = (el) => {
    if (el) el.style.transition = 'transform 0.25s ease';
  };
  addChevronStyle(consultChevron);
  addChevronStyle(heroChevron);

});
