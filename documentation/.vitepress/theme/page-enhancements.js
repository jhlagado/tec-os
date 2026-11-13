// Chapter running heads, numbered figures and image previews are refreshed
// after navigation as well as on the first page.

let lightboxSingleton = null;

export async function enhancePage() {
  markRunningHead();
  buildFigures();
  bindLightboxImages();
}

// The chapter's first paragraph is a hand-written prev/index/next line.
// Marking it lets the stylesheet set it as a running head above the title
// rather than leaving it as body prose.
function markRunningHead() {
  const first = document.querySelector('.vp-doc > div > p:first-child');
  if (!first || first.classList.contains('running-head')) return;
  const links = first.querySelectorAll('a');
  if (links.length < 2) return;
  // Only link text and the separators between them, nothing else.
  const stripped = first.textContent.replace(/[|·\s←→]/g, '');
  const linked = Array.from(links)
    .map((a) => a.textContent)
    .join('')
    .replace(/[|·\s←→]/g, '');
  if (stripped !== linked) return;
  first.classList.add('running-head');
}

// An image alone in a paragraph is a plate. Promote it to a real <figure>
// and give it a caption numbered within the chapter, so figures can be
// referred to by number the way the printed books do.
function buildFigures() {
  const chapter = document.querySelector('.page-eyebrow')?.dataset.folio ?? '';
  let plate = 0;

  document.querySelectorAll('.vp-doc p > img:only-child').forEach((img) => {
    const para = img.parentElement;
    if (para.dataset.plate) return;
    plate += 1;

    const figure = document.createElement('figure');
    figure.className = 'plate';
    figure.appendChild(img);

    if (img.alt) {
      const caption = document.createElement('figcaption');
      const num = document.createElement('span');
      num.className = 'plate__num';
      num.textContent = chapter
        ? `Fig. ${Number(chapter)}.${plate}`
        : `Fig. ${plate}`;
      caption.appendChild(num);
      caption.appendChild(document.createTextNode(img.alt));
      figure.appendChild(caption);
    }

    para.replaceWith(figure);
    figure.dataset.plate = String(plate);
  });
}

function ensureLightbox() {
  if (lightboxSingleton) return lightboxSingleton;

  const lightbox = document.createElement('div');
  lightbox.className = 'image-lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Image preview');
  lightbox.hidden = true;
  lightbox.innerHTML = [
    '<button class="image-lightbox__close" type="button" aria-label="Close image preview">&times;</button>',
    '<figure class="image-lightbox__figure">',
    '<img class="image-lightbox__image" alt="">',
    '<figcaption class="image-lightbox__caption"></figcaption>',
    '</figure>',
  ].join('');
  document.body.appendChild(lightbox);

  const previewImage = lightbox.querySelector('.image-lightbox__image');
  const caption = lightbox.querySelector('.image-lightbox__caption');
  const closeButton = lightbox.querySelector('.image-lightbox__close');
  let lastFocused = null;
  let previousScrollY = 0;

  function closeLightbox() {
    lightbox.hidden = true;
    document.documentElement.classList.remove('has-image-lightbox');
    document.body.classList.remove('has-image-lightbox');
    document.body.style.top = '';
    previewImage.removeAttribute('src');
    previewImage.alt = '';
    caption.textContent = '';
    if (lastFocused) {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
    window.scrollTo({ top: previousScrollY, left: 0, behavior: 'instant' });
  }

  function openLightbox(img) {
    lastFocused = document.activeElement;
    previousScrollY = window.scrollY || window.pageYOffset || 0;
    previewImage.src = img.currentSrc || img.src;
    previewImage.alt = img.alt || '';
    caption.textContent = img.alt || '';
    caption.hidden = !img.alt;
    document.body.style.top = `-${previousScrollY}px`;
    lightbox.hidden = false;
    document.documentElement.classList.add('has-image-lightbox');
    document.body.classList.add('has-image-lightbox');
  }

  closeButton.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (!lightbox.hidden && event.key === 'Escape') closeLightbox();
  });

  lightboxSingleton = { open: openLightbox };
  return lightboxSingleton;
}

function bindLightboxImages() {
  const contentImages = Array.from(document.querySelectorAll('.vp-doc img'));
  if (contentImages.length === 0) return;
  const lightbox = ensureLightbox();

  contentImages.forEach((img) => {
    if (img.closest('a') || img.classList.contains('js-lightbox-image')) return;
    img.classList.add('js-lightbox-image');
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute(
      'aria-label',
      img.alt ? `Open image preview: ${img.alt}` : 'Open image preview',
    );
    img.addEventListener('click', () => lightbox.open(img));
    img.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        lightbox.open(img);
      }
    });
  });
}
