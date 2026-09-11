import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import "./marketing.css";

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

const cases = [
  {
    title: "Городская квартира",
    note: "Точечная обработка без следов и запаха",
    image: "https://picsum.photos/seed/kazdez-apartment/1200/1500",
  },
  {
    title: "Ресторанная кухня",
    note: "Ночная смена, утро без остановки",
    image: "https://picsum.photos/seed/kazdez-kitchen/1200/1500",
  },
  {
    title: "Складской комплекс",
    note: "Периметр под контролем круглый год",
    image: "https://picsum.photos/seed/kazdez-warehouse/1200/1500",
  },
  {
    title: "Частный дом",
    note: "Безопасный сценарий для семьи и питомцев",
    image: "https://picsum.photos/seed/kazdez-home/1200/1500",
  },
];

const testimonials = [
  {
    quote: "Команда приехала ночью, а утром ресторан открылся по расписанию. С тех пор — только плановый контроль.",
    author: "Айгерим С.",
    role: "Управляющая рестораном",
    image: "https://picsum.photos/seed/kazdez-portrait-one/320/320",
  },
  {
    quote: "Нам объяснили не только что сделают, но и почему проблема появилась. Через сутки пространство снова стало нашим.",
    author: "Данияр К.",
    role: "Владелец дома",
    image: "https://picsum.photos/seed/kazdez-portrait-two/320/320",
  },
  {
    quote: "Один подрядчик для пяти объектов, прозрачные акты и понятный график. Никаких сюрпризов между визитами.",
    author: "Мария Л.",
    role: "Операционный директор",
    image: "https://picsum.photos/seed/kazdez-portrait-three/320/320",
  },
];

function Arrow({ direction = "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={direction === "left" ? "mk-arrow mk-arrow--left" : "mk-arrow"}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function ActionLink({ href, children, light = false }) {
  return (
    <a className={`mk-action ${light ? "mk-action--light" : ""}`} href={href}>
      <span>{children}</span>
      <span className="mk-action__icon"><Arrow /></span>
    </a>
  );
}

function Navigation() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const firstLinkRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <>
      <header className="mk-nav-shell" data-nav>
        <nav className="mk-nav" aria-label="Основная навигация">
          <a className="mk-wordmark" href="#top" aria-label="KazDez — на главную">
            <span className="mk-wordmark__signal" />
            KAZDEZ
          </a>
          <div className="mk-nav__links">
            <a href="#method">Метод</a>
            <a href="#work">Кейсы</a>
            <a href="#trust">Отзывы</a>
          </div>
          <div className="mk-nav__actions">
            <a className="mk-login-link" href="?login=1">Войти</a>
            <a className="mk-nav-cta" href="#contact">Вызвать специалиста</a>
          </div>
          <button
            ref={menuButtonRef}
            className={`mk-menu-button ${open ? "is-open" : ""}`}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </nav>
      </header>
      <div id="mobile-menu" className={`mk-menu-overlay ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="mk-menu-overlay__links">
          <a ref={firstLinkRef} href="#method" onClick={closeMenu}>Метод</a>
          <a href="#work" onClick={closeMenu}>Кейсы</a>
          <a href="#trust" onClick={closeMenu}>Отзывы</a>
          <a href="?login=1" onClick={closeMenu}>Войти в систему</a>
        </div>
        <a className="mk-menu-overlay__cta" href="#contact" onClick={closeMenu}>Вызвать специалиста <Arrow /></a>
      </div>
    </>
  );
}

function Hero() {
  return (
    <section className="mk-hero" id="top" aria-labelledby="hero-title">
      <div className="mk-hero__copy">
        <p className="mk-overline" data-hero-line>Профессиональная дезинсекция в Казахстане</p>
        <h1 id="hero-title" data-hero-title>
          Тишина<br />после <em>нас.</em>
        </h1>
        <div className="mk-hero__bottom" data-hero-line>
          <p>Возвращаем пространству спокойствие — точно, безопасно и без лишнего шума.</p>
          <ActionLink href="#contact" light>Решить проблему</ActionLink>
        </div>
      </div>
      <div className="mk-hero__visual" data-hero-visual>
        <div className="mk-image-shell">
          <div className="mk-image-core">
            <img src="https://picsum.photos/seed/kazdez-calm-interior/1400/1700" alt="Спокойный светлый интерьер после профессиональной обработки" />
            <div className="mk-hero__wash" />
            <div className="mk-orbit" aria-hidden="true"><span /></div>
            <div className="mk-hero__caption">
              <span>Защита пространства</span>
              <strong>24 / 7</strong>
            </div>
          </div>
        </div>
      </div>
      <div className="mk-scroll-cue" aria-hidden="true"><span />Прокрутите</div>
    </section>
  );
}

function Marquee() {
  const phrases = ["Безопасно для семьи", "Точный протокол", "Гарантия результата", "Работаем незаметно"];
  return (
    <div className="mk-marquee" aria-label={phrases.join(", ")}>
      <div className="mk-marquee__track">
        {[...phrases, ...phrases].map((phrase, index) => (
          <span key={`${phrase}-${index}`} aria-hidden={index >= phrases.length}><i />{phrase}</span>
        ))}
      </div>
    </div>
  );
}

function Method() {
  return (
    <section className="mk-method" id="method" aria-labelledby="method-title">
      <div className="mk-chapter-heading" data-reveal>
        <p className="mk-overline">Порядок вместо паники</p>
        <h2 id="method-title">Сначала находим причину.<br /><em>Потом убираем её.</em></h2>
      </div>
      <div className="mk-bento">
        <article className="mk-bezel mk-bento__main" data-reveal>
          <div className="mk-bezel__core mk-bento__image">
            <img data-scale-image src="https://picsum.photos/seed/kazdez-inspection/1500/1100" alt="Специалист осматривает помещение перед обработкой" />
            <div className="mk-bento__image-copy">
              <span>Диагностика до первого распыления</span>
              <strong>01</strong>
            </div>
          </div>
        </article>
        <article className="mk-bezel mk-bento__side" data-reveal>
          <div className="mk-bezel__core mk-bento__text">
            <p>Собираем карту риска объекта, выбираем препарат и дозировку под конкретную задачу.</p>
            <span className="mk-fineprint">Не шаблонная обработка, а сценарий для вашего пространства.</span>
          </div>
        </article>
        <article className="mk-bezel mk-bento__side" data-reveal>
          <div className="mk-bezel__core mk-bento__metric">
            <span>Контрольный визит</span>
            <strong>14 дней</strong>
            <p>Проверяем результат и закрываем цикл, а не исчезаем после оплаты.</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function CaseAccordion() {
  const [active, setActive] = useState(0);
  return (
    <section className="mk-work" id="work" aria-labelledby="work-title">
      <div className="mk-work__intro" data-reveal>
        <p className="mk-overline">Среда меняется. Принцип — нет.</p>
        <h2 id="work-title">Четыре пространства.<br />Один уровень контроля.</h2>
      </div>
      <div className="mk-accordion" role="list">
        {cases.map((item, index) => (
          <button
            className={`mk-accordion__item ${active === index ? "is-active" : ""}`}
            key={item.title}
            type="button"
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
            aria-pressed={active === index}
            role="listitem"
          >
            <img src={item.image} alt="" />
            <span className="mk-accordion__shade" />
            <span className="mk-accordion__index">0{index + 1}</span>
            <span className="mk-accordion__copy">
              <strong>{item.title}</strong>
              <small>{item.note}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Proof() {
  const steps = [
    { number: "01", title: "Видим больше", text: "Следы, маршруты, точки входа — осмотр превращает догадки в карту действий.", image: "https://picsum.photos/seed/kazdez-detail-one/1000/750" },
    { number: "02", title: "Действуем точнее", text: "Подбираем метод под объект, людей внутри и реальную степень заражения.", image: "https://picsum.photos/seed/kazdez-detail-two/1000/750" },
    { number: "03", title: "Остаёмся рядом", text: "Фиксируем результат, напоминаем о контрольной точке и держим историю объекта.", image: "https://picsum.photos/seed/kazdez-detail-three/1000/750" },
  ];
  return (
    <section className="mk-proof" aria-labelledby="proof-title">
      <div className="mk-proof__pin">
        <p className="mk-overline">Спокойствие — это система</p>
        <h2 id="proof-title">Не обещание.<br /><em>Протокол.</em></h2>
        <p>Каждый этап виден и понятен — от первого звонка до контрольного визита.</p>
      </div>
      <div className="mk-proof__steps">
        {steps.map((step) => (
          <article className="mk-proof-card" key={step.number}>
            <div className="mk-proof-card__image">
              <img data-scale-image src={step.image} alt="" />
            </div>
            <div className="mk-proof-card__copy">
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const [active, setActive] = useState(0);
  const current = testimonials[active];
  const move = (direction) => setActive((value) => (value + direction + testimonials.length) % testimonials.length);
  return (
    <section className="mk-testimonials" id="trust" aria-labelledby="trust-title">
      <div className="mk-testimonials__heading" data-reveal>
        <p className="mk-overline">Когда пространство снова ваше</p>
        <h2 id="trust-title">Люди замечают<br /><em>отсутствие проблемы.</em></h2>
      </div>
      <div className="mk-testimonial" data-reveal>
        <div className="mk-testimonial__portraits" aria-hidden="true">
          {testimonials.map((item, index) => <img className={active === index ? "is-active" : ""} src={item.image} alt="" key={item.author} />)}
        </div>
        <div className="mk-testimonial__content" aria-live="polite">
          <blockquote>«{current.quote}»</blockquote>
          <div className="mk-testimonial__meta">
            <div><strong>{current.author}</strong><span>{current.role}</span></div>
            <div className="mk-testimonial__controls">
              <button type="button" onClick={() => move(-1)} aria-label="Предыдущий отзыв"><Arrow direction="left" /></button>
              <span>{String(active + 1).padStart(2, "0")} / {String(testimonials.length).padStart(2, "0")}</span>
              <button type="button" onClick={() => move(1)} aria-label="Следующий отзыв"><Arrow /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mk-footer" id="contact">
      <div className="mk-footer__glow" aria-hidden="true" />
      <div className="mk-footer__lead" data-reveal>
        <p className="mk-overline">Проблема не должна становиться привычкой</p>
        <h2>Верните себе<br /><em>спокойствие.</em></h2>
        <ActionLink href="?login=1" light>Открыть KazDez</ActionLink>
      </div>
      <div className="mk-footer__bottom">
        <a className="mk-wordmark mk-wordmark--footer" href="#top"><span className="mk-wordmark__signal" />KAZDEZ</a>
        <p>Профессиональная защита домов и бизнеса по Казахстану.</p>
        <div>
          <a href="#method">Метод</a>
          <a href="#work">Кейсы</a>
          <a href="?login=1">Для команды</a>
        </div>
        <span>© {new Date().getFullYear()} KazDez</span>
      </div>
    </footer>
  );
}

export default function MarketingPage() {
  const pageRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("mk-body");
    return () => document.body.classList.remove("mk-body");
  }, []);

  useGSAP(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      gsap.set("[data-hero-title], [data-hero-line], [data-hero-visual], [data-reveal]", { clearProps: "all" });
      return;
    }

    const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
    intro
      .from("[data-nav]", { y: -36, opacity: 0, duration: 1 })
      .from("[data-hero-title]", { yPercent: 35, opacity: 0, duration: 1.25 }, "-=0.65")
      .from("[data-hero-line]", { y: 28, opacity: 0, duration: 0.8, stagger: 0.12 }, "-=0.8")
      .from("[data-hero-visual]", { xPercent: 14, scale: 0.86, opacity: 0, duration: 1.4 }, "-=1.05");

    gsap.to("[data-hero-visual]", {
      yPercent: 12,
      ease: "none",
      scrollTrigger: { trigger: ".mk-hero", start: "top top", end: "bottom top", scrub: 1.1 },
    });

    gsap.utils.toArray("[data-reveal]").forEach((element) => {
      gsap.from(element, {
        y: 72,
        opacity: 0,
        filter: "blur(10px)",
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: element, start: "top 86%", once: true },
      });
    });

    gsap.utils.toArray("[data-scale-image]").forEach((image) => {
      gsap.fromTo(image,
        { scale: 0.8, opacity: 0.52 },
        {
          scale: 1,
          opacity: 1,
          ease: "none",
          scrollTrigger: { trigger: image, start: "top 96%", end: "center 48%", scrub: 1 },
        },
      );
      gsap.to(image, {
        opacity: 0.24,
        ease: "none",
        scrollTrigger: { trigger: image, start: "center 30%", end: "bottom top", scrub: 1 },
      });
    });

    const media = gsap.matchMedia();
    media.add("(min-width: 900px)", () => {
      ScrollTrigger.create({
        trigger: ".mk-proof",
        start: "top 12%",
        end: "bottom 76%",
        pin: ".mk-proof__pin",
        pinSpacing: false,
      });
    });

    return () => media.revert();
  }, { scope: pageRef });

  return (
    <main className="mk-page" ref={pageRef}>
      <div className="mk-grain" aria-hidden="true" />
      <Navigation />
      <Hero />
      <Marquee />
      <Method />
      <CaseAccordion />
      <Proof />
      <Testimonials />
      <Footer />
    </main>
  );
}
