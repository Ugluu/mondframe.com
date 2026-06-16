/* MONDFRAME — shared interaction layer
   Requires: gsap + ScrollTrigger + Lenis (loaded via CDN before this file) */
(function () {
    'use strict';

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touch = window.matchMedia('(pointer: coarse)').matches;
    if (reduced) document.documentElement.classList.add('reduced');

    var hasGsap = typeof gsap !== 'undefined';
    if (hasGsap) gsap.registerPlugin(ScrollTrigger);

    /* ---------- Smooth scrolling (Lenis) ---------- */
    var lenis = null;
    if (!reduced && typeof Lenis !== 'undefined') {
        lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
        if (hasGsap) lenis.on('scroll', ScrollTrigger.update);
        // Lenis drives its own RAF so the scroll loop can never stall on
        // another GSAP tween (e.g. the preloader) sharing gsap.ticker.
        requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
    }
    window.__lenis = lenis;

    /* ---------- In-page routing (clean URLs + Lenis) ----------
       Homepage sections are reachable at /services /process /book.
       On the homepage those links smooth-scroll without a reload and
       keep the short URL in the address bar; from any other page they
       navigate to the matching stub which redirects back to /#section. */
    var SECTIONS = { 'services': 1, 'process': 1, 'book': 1 };

    function onHome() {
        var p = location.pathname.replace(/\/+$/, '');
        // Section clicks rewrite the URL to /services /process /book, so treat
        // those as the homepage too — otherwise the next in-page section link
        // would fall through to a full reload via the redirect stub.
        return p === '' || p === '/index.html' || !!SECTIONS[p.replace(/^\//, '')];
    }

    function scrollToEl(el, immediate) {
        if (lenis) lenis.scrollTo(targetY(el), { offset: 0, duration: immediate ? 0 : 1.2, immediate: !!immediate });
        else window.scrollTo(0, targetY(el));
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href]');
        if (!a) return;
        var raw = a.getAttribute('href');
        var url;
        try { url = new URL(a.href, location.href); } catch (err) { return; }
        if (url.origin !== location.origin) return;

        // Same-page fragment (e.g. #book)
        if (raw.charAt(0) === '#') {
            var t = document.querySelector(raw);
            if (!t) return;
            e.preventDefault(); closeMenu();
            scrollToEl(t);
            history.replaceState(null, '', '/' + raw.slice(1));
            return;
        }

        // Clean section route on the homepage -> smooth scroll, no reload
        var name = url.pathname.replace(/^\/|\/$/g, '');
        if (onHome() && SECTIONS[name]) {
            var el = document.getElementById(name);
            if (!el) return;
            e.preventDefault(); closeMenu();
            scrollToEl(el);
            history.replaceState(null, '', '/' + name);
        }
    });

    /* Scroll to the right section when landing with a hash or section route.
       Re-corrects a couple of times because pinned ScrollTriggers, fonts and
       video metadata can shift layout just after load. */
    /* Absolute scroll position for a target. Pinned sections (the process
       timeline) are unreliable via getBoundingClientRect because the pin
       spacer shifts their box, so use the ScrollTrigger start instead. */
    function targetY(el) {
        if (hasGsap) {
            var sts = ScrollTrigger.getAll();
            for (var i = 0; i < sts.length; i++) {
                var st = sts[i];
                if (st.pin && st.trigger && (st.trigger === el || el.contains(st.trigger) || st.trigger.contains(el))) {
                    return st.start;
                }
            }
        }
        return el.getBoundingClientRect().top + (lenis ? lenis.scroll : window.scrollY);
    }
    function jumpTo(el) {
        if (hasGsap) ScrollTrigger.refresh();
        var y = targetY(el);
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
    }
    // Section routes arrive as /?goto=section (a query, not a #hash) so the
    // browser never performs a native anchor jump — that jump moves the window
    // without telling Lenis and leaves the two scroll models permanently
    // desynced (scrolling up then appears stuck). Captured once so re-runs
    // still work after the URL is cleaned to /section.
    var pendingGoto = new URLSearchParams(location.search).get('goto') ||
        (location.hash ? location.hash.slice(1) : '');

    function gotoInitial() {
        if (!pendingGoto) return;
        var el = document.getElementById(pendingGoto);
        if (!el) return;
        if (SECTIONS[pendingGoto]) history.replaceState(null, '', '/' + pendingGoto);
        // Force both scroll models back to the top and in sync first.
        window.scrollTo(0, 0);
        if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
        jumpTo(el);
        setTimeout(function () { jumpTo(el); }, 300);
        setTimeout(function () { jumpTo(el); }, 700);
    }
    // Run as soon as layout is ready rather than waiting for `load`, which on
    // this media-heavy page can be seconds out; re-run on load as a safety net.
    requestAnimationFrame(function () { requestAnimationFrame(gotoInitial); });
    window.addEventListener('load', function () { setTimeout(gotoInitial, 80); });

    /* ---------- Preloader ---------- */
    var loader = document.getElementById('loader');
    if (loader) {
        var seen = sessionStorage.getItem('mf-loaded');
        var finish = function () {
            loader.classList.add('done');
            sessionStorage.setItem('mf-loaded', '1');
            document.body.classList.add('ready');
            setTimeout(function () { loader.remove(); }, 1100);
        };
        if (seen || reduced) {
            finish();
        } else {
            // Hard safety net: if the rAF-driven tween ever stalls (backgrounded
            // tab, throttling, gsap.ticker hiccup) force the loader to dismiss so
            // the page can never be locked behind a black screen.
            var done = false;
            var safeFinish = function () { if (done) return; done = true; finish(); };
            setTimeout(safeFinish, 3000);
            var bar = loader.querySelector('.loader-bar i');
            var num = loader.querySelector('.loader-num');
            var p = { v: 0 };
            if (hasGsap) {
                gsap.to(p, {
                    v: 100, duration: 1.6, ease: 'power3.inOut',
                    onUpdate: function () {
                        if (num) num.textContent = String(Math.round(p.v)).padStart(3, '0');
                        if (bar) bar.style.transform = 'scaleX(' + p.v / 100 + ')';
                    },
                    onComplete: safeFinish
                });
            } else { safeFinish(); }
        }
    } else {
        document.body.classList.add('ready');
    }

    /* ---------- Custom cursor ---------- */
    if (!touch && !reduced) {
        var cur = document.createElement('div');
        cur.className = 'cursor';
        cur.innerHTML = '<div class="cursor-ring"><span></span></div><div class="cursor-dot"></div>';
        document.body.appendChild(cur);
        var ring = cur.querySelector('.cursor-ring');
        var dot = cur.querySelector('.cursor-dot');
        var lbl = cur.querySelector('.cursor-ring span');
        var mx = -100, my = -100, rx = -100, ry = -100;
        window.addEventListener('mousemove', function (e) {
            mx = e.clientX; my = e.clientY;
            dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
        }, { passive: true });
        (function loop() {
            rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
            ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
            requestAnimationFrame(loop);
        })();
        document.addEventListener('mouseover', function (e) {
            var labelled = e.target.closest('[data-cursor]');
            var hov = e.target.closest('a,button,.pick label,input,textarea,.ba-slider');
            if (labelled) {
                lbl.textContent = labelled.getAttribute('data-cursor');
                cur.classList.add('is-label'); cur.classList.remove('is-hover');
            } else if (hov) {
                cur.classList.add('is-hover'); cur.classList.remove('is-label');
            } else {
                cur.classList.remove('is-hover', 'is-label');
            }
        });
    }

    /* ---------- Menu overlay ---------- */
    var menu = document.getElementById('menu');
    function closeMenu() {
        if (menu && menu.classList.contains('open')) {
            menu.classList.remove('open');
            if (lenis) lenis.start();
        }
    }
    document.querySelectorAll('[data-menu-open]').forEach(function (b) {
        b.addEventListener('click', function () {
            menu.classList.add('open');
            if (lenis) lenis.stop();
        });
    });
    document.querySelectorAll('[data-menu-close]').forEach(function (b) {
        b.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeMenu(); closeModals(); }
    });

    /* ---------- Hide nav on scroll down ---------- */
    var nav = document.querySelector('.nav');
    var lastY = 0;
    window.addEventListener('scroll', function () {
        var y = window.scrollY;
        if (nav) nav.classList.toggle('hidden', y > lastY && y > 300);
        lastY = y;
    }, { passive: true });

    /* ---------- Split-text line reveals ---------- */
    document.querySelectorAll('[data-split]').forEach(function (el) {
        var nodes = Array.prototype.slice.call(el.childNodes);
        el.innerHTML = '';
        nodes.forEach(function (node) {
            if (node.nodeType === 3) {
                node.textContent.split(/\s+/).forEach(function (word) {
                    if (!word) return;
                    var w = document.createElement('span'); w.className = 'w';
                    var wi = document.createElement('span'); wi.className = 'wi';
                    wi.textContent = word;
                    w.appendChild(wi); el.appendChild(w);
                    el.appendChild(document.createTextNode(' '));
                });
            } else if (node.nodeType === 1) {
                var w = document.createElement('span'); w.className = 'w';
                var wi = document.createElement('span'); wi.className = 'wi';
                wi.appendChild(node); w.appendChild(wi);
                el.appendChild(w); el.appendChild(document.createTextNode(' '));
            }
        });
    });

    if (hasGsap && !reduced) {
        document.querySelectorAll('[data-split]').forEach(function (el) {
            gsap.to(el.querySelectorAll('.wi'), {
                y: 0, yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.045,
                scrollTrigger: { trigger: el, start: 'top 88%' },
                startAt: { yPercent: 115 },
                onStart: function () { el.style.visibility = 'visible'; }
            });
        });

        document.querySelectorAll('[data-reveal]').forEach(function (el) {
            gsap.to(el, {
                opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
                delay: parseFloat(el.getAttribute('data-delay') || 0),
                scrollTrigger: { trigger: el, start: 'top 90%' }
            });
        });

        /* parallax on media */
        document.querySelectorAll('[data-parallax]').forEach(function (wrap) {
            var media = wrap.querySelector('video,img');
            if (!media) return;
            gsap.fromTo(media, { yPercent: -8 }, {
                yPercent: 0, ease: 'none',
                scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: true }
            });
        });

        /* progress lines */
        document.querySelectorAll('.process-line i').forEach(function (line) {
            gsap.to(line, {
                scaleX: 1, ease: 'none',
                scrollTrigger: { trigger: line.parentElement, start: 'top 85%', end: 'top 40%', scrub: true }
            });
        });
    } else {
        document.querySelectorAll('[data-split]').forEach(function (el) {
            el.querySelectorAll('.wi').forEach(function (wi) { wi.style.transform = 'none'; });
        });
    }

    /* ---------- Counters ---------- */
    var counters = document.querySelectorAll('[data-count]');
    if (counters.length) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                io.unobserve(en.target);
                var el = en.target;
                var end = parseFloat(el.getAttribute('data-count'));
                if (reduced || !hasGsap) { el.textContent = end; return; }
                var o = { v: 0 };
                gsap.to(o, {
                    v: end, duration: 1.8, ease: 'power3.out',
                    onUpdate: function () { el.textContent = Math.round(o.v); }
                });
            });
        }, { threshold: 0.4 });
        counters.forEach(function (c) { io.observe(c); });
    }

    /* ---------- Magnetic buttons ---------- */
    if (!touch && !reduced && hasGsap) {
        document.querySelectorAll('[data-magnetic]').forEach(function (el) {
            var sx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' });
            var sy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
            el.addEventListener('mousemove', function (e) {
                var r = el.getBoundingClientRect();
                sx((e.clientX - r.left - r.width / 2) * 0.3);
                sy((e.clientY - r.top - r.height / 2) * 0.3);
            });
            el.addEventListener('mouseleave', function () { sx(0); sy(0); });
        });
    }

    /* ---------- Lazy video play/pause ---------- */
    var vids = document.querySelectorAll('video[data-auto]');
    if (vids.length) {
        var vio = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                var v = en.target;
                if (en.isIntersecting) {
                    if (v.dataset.src && !v.src) v.src = v.dataset.src;
                    v.play().catch(function () {});
                } else { v.pause(); }
            });
        }, { rootMargin: '200px' });
        vids.forEach(function (v) { vio.observe(v); });
    }

    /* ---------- Process: horizontal scroll (desktop) ---------- */
    var track = document.querySelector('.process-track');
    if (track && hasGsap && !reduced) {
        ScrollTrigger.matchMedia({
            '(min-width: 769px)': function () {
                var getX = function () { return -(track.scrollWidth - window.innerWidth + 40); };
                gsap.to(track, {
                    x: getX, ease: 'none',
                    scrollTrigger: {
                        trigger: '.process', start: 'top 12%',
                        end: function () { return '+=' + (track.scrollWidth - window.innerWidth + 400); },
                        pin: true, scrub: 0.6, invalidateOnRefresh: true
                    }
                });
            }
        });
    }

    /* ---------- Services: depth on stacked panels ---------- */
    if (hasGsap && !reduced) {
        document.querySelectorAll('.service').forEach(function (panel) {
            var media = panel.querySelector('.service-media video, .service-media img');
            if (!media) return;
            gsap.fromTo(media, { scale: 1.18 }, {
                scale: 1, ease: 'none',
                scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top top', scrub: true }
            });
        });
    }

    /* ---------- Modals (360 tour / film) ---------- */
    function closeModals() {
        document.querySelectorAll('.modal.open').forEach(function (m) {
            m.classList.remove('open');
            m.querySelectorAll('video').forEach(function (v) { v.pause(); });
            if (lenis) lenis.start();
        });
    }
    window.closeModals = closeModals;
    document.querySelectorAll('[data-modal]').forEach(function (t) {
        t.addEventListener('click', function () {
            var m = document.getElementById(t.getAttribute('data-modal'));
            if (!m) return;
            /* lazy-load iframe */
            var frame = m.querySelector('[data-iframe]');
            if (frame && !frame.querySelector('iframe')) {
                var f = document.createElement('iframe');
                f.src = frame.getAttribute('data-iframe');
                f.allow = 'xr-spatial-tracking; gyroscope; accelerometer; fullscreen';
                f.allowFullscreen = true;
                frame.appendChild(f);
            }
            m.classList.add('open');
            var v = m.querySelector('video');
            if (v) { v.currentTime = 0; v.muted = false; v.play().catch(function () { v.muted = true; v.play(); }); }
            if (lenis) lenis.stop();
        });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
        m.addEventListener('click', function (e) { if (e.target === m) closeModals(); });
        var c = m.querySelector('.modal-close');
        if (c) c.addEventListener('click', closeModals);
    });

    /* ---------- Booking form ---------- */
    var bform = document.getElementById('bform');
    if (bform) {
        var steps = bform.querySelectorAll('.bstep');
        var dots = document.querySelectorAll('.bform-progress span');
        var err = bform.querySelector('.err');
        var cur = 0;

        function show(i) {
            steps.forEach(function (s, n) { s.classList.toggle('on', n === i); });
            dots.forEach(function (d, n) { d.classList.toggle('on', n <= i); });
            err.classList.remove('show');
            cur = i;
        }

        function validate(i) {
            if (i === 0) {
                if (!bform.querySelectorAll('input[name="services[]"]:checked').length) {
                    err.textContent = 'Select at least one service to continue.';
                    return false;
                }
            }
            if (i === 1) {
                if (!bform.querySelector('input[name="property_type"]:checked')) {
                    err.textContent = 'Select a property type to continue.';
                    return false;
                }
                if (!bform.querySelector('#bloc').value.trim()) {
                    err.textContent = 'Add the property location to continue.';
                    return false;
                }
            }
            return true;
        }

        bform.querySelectorAll('[data-next]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (validate(cur)) show(cur + 1);
                else err.classList.add('show');
            });
        });
        bform.querySelectorAll('[data-back]').forEach(function (b) {
            b.addEventListener('click', function () { show(cur - 1); });
        });

        bform.addEventListener('submit', function (e) {
            e.preventDefault();
            var name = bform.querySelector('#bname');
            var mail = bform.querySelector('#bmail');
            if (!name.value.trim() || !mail.value.trim() || !mail.checkValidity()) {
                err.textContent = 'Add your name and a valid email so we can reply.';
                err.classList.add('show');
                return;
            }
            var btn = bform.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.querySelector('span').textContent = 'Sending…';
            fetch(bform.action, {
                method: 'POST',
                body: new FormData(bform),
                headers: { Accept: 'application/json' }
            }).then(function (r) {
                if (!r.ok) throw new Error('send failed');
                bform.style.display = 'none';
                document.querySelector('.bform-progress').style.display = 'none';
                document.querySelector('.bform-done').classList.add('show');
            }).catch(function () {
                btn.disabled = false;
                btn.querySelector('span').textContent = 'Send booking request';
                err.textContent = 'Something went wrong — email us at hello@mondframe.co.uk instead.';
                err.classList.add('show');
            });
        });
    }
})();
