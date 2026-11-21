import 'server-only';
import pptxgen from 'pptxgenjs';
import type { PresentationDeck, PresentationSlide } from '@/lib/presentation-schema';

const PALETTES = {
  emerald: { bg: '0D251D', panel: '15392C', accent: '7EE0B1', text: 'F4F8F5', muted: 'B8C9BF', secondary: 'D7F5E6' },
  midnight: { bg: '111827', panel: '1F2937', accent: '93C5FD', text: 'F8FAFC', muted: 'CBD5E1', secondary: 'E0F2FE' },
  sand: { bg: 'F5F0E6', panel: 'E8E0D1', accent: '176B46', text: '20352A', muted: '52655B', secondary: 'FFFFFF' },
} as const;

export type PresentationTheme = keyof typeof PALETTES;

function addBulletList(slide: pptxgen.Slide, bullets: string[], colors: typeof PALETTES[PresentationTheme], x: number, y: number, w: number) {
  const visible = bullets.slice(0, 8);
  visible.forEach((text, index) => {
    const top = y + index * 0.67;
    slide.addShape(pptxgen.ShapeType.ellipse, {
      x, y: top + 0.16, w: 0.12, h: 0.12,
      fill: { color: colors.accent }, line: { color: colors.accent, transparency: 100 },
    });
    slide.addText(text, {
      x: x + 0.28, y: top, w: w - 0.28, h: 0.5,
      fontFace: 'Aptos', fontSize: 19, color: colors.text, margin: 0,
      valign: 'middle', breakLine: false, fit: 'shrink',
    });
  });
}

export async function buildPresentationPptx(deck: PresentationDeck, theme: PresentationTheme = 'emerald') {
  const colors = PALETTES[theme];
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Ilm AI';
  pptx.subject = deck.title;
  pptx.title = deck.title;
  pptx.company = 'Ilm AI';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  const W = 13.333;
  const H = 7.5;
  deck.slides.forEach((item: PresentationSlide, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: colors.bg };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.18, h: H,
      fill: { color: colors.accent }, line: { color: colors.accent, transparency: 100 },
    });
    slide.addText('ILM AI  /  LEARNING DECK', {
      x: 0.55, y: 0.3, w: 5, h: 0.2, fontFace: 'Aptos',
      fontSize: 8, bold: true, charSpacing: 1.7, color: colors.accent, margin: 0,
    });

    if (item.type === 'title') {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 9.15, y: 0.9, w: 3.0, h: 3.0,
        fill: { color: colors.panel, transparency: 6 }, line: { color: colors.accent, width: 1.2, transparency: 25 },
      });
      slide.addText(deck.title, {
        x: 0.85, y: 1.65, w: 8.4, h: 1.65,
        fontFace: 'Aptos Display', fontSize: 36, bold: true, color: colors.text,
        margin: 0, breakLine: false, valign: 'middle', fit: 'shrink',
      });
      if (item.title && item.title !== deck.title)
        slide.addText(item.title, { x: 0.9, y: 3.55, w: 7.8, h: 0.75, fontFace: 'Aptos', fontSize: 21, color: colors.muted, margin: 0, fit: 'shrink' });
      if (item.bullets.length)
        slide.addText(item.bullets.join('  ·  '), { x: 0.9, y: 5.45, w: 8.3, h: 0.5, fontFace: 'Aptos', fontSize: 14, color: colors.accent, margin: 0, fit: 'shrink' });
    } else if (item.type === 'closing') {
      slide.addText(item.title, {
        x: 1.0, y: 2.15, w: 11.2, h: 1.25, fontFace: 'Aptos Display',
        fontSize: 36, bold: true, color: colors.text, align: 'center', margin: 0, fit: 'shrink',
      });
      if (item.bullets.length) {
        slide.addText(item.bullets.join('\n'), {
          x: 2.0, y: 4.0, w: 9.3, h: 1.2, fontFace: 'Aptos',
          fontSize: 18, color: colors.muted, align: 'center', margin: 0, fit: 'shrink',
        });
      }
    } else {
      slide.addText(item.title, {
        x: 0.8, y: 0.95, w: 11.7, h: 0.85, fontFace: 'Aptos Display',
        fontSize: 29, bold: true, color: colors.text, margin: 0, fit: 'shrink',
      });
      slide.addShape(pptx.ShapeType.line, {
        x: 0.8, y: 1.95, w: 1.0, h: 0,
        line: { color: colors.accent, width: 2.2 },
      });
      if (item.type === 'bullets') addBulletList(slide, item.bullets, colors, 1.0, 2.45, 10.8);
      if (item.type === 'two_column') {
        const panels = [
          { x: 0.85, title: 'KEY IDEA', bullets: item.left },
          { x: 6.85, title: 'DETAILS', bullets: item.right },
        ];
        for (const panel of panels) {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: panel.x, y: 2.35, w: 5.55, h: 4.15, rectRadius: 0.12,
            fill: { color: colors.panel }, line: { color: colors.panel, transparency: 100 },
          });
          slide.addText(panel.title, {
            x: panel.x + 0.3, y: 2.65, w: 4.9, h: 0.3,
            fontFace: 'Aptos', fontSize: 10, bold: true, charSpacing: 1.2,
            color: colors.accent, margin: 0,
          });
          addBulletList(slide, panel.bullets, colors, panel.x + 0.35, 3.2, 4.9);
        }
      }
      if (item.type === 'quote') {
        slide.addText('“', { x: 0.9, y: 2.2, w: 0.7, h: 0.9, fontFace: 'Georgia', fontSize: 64, color: colors.accent, margin: 0 });
        slide.addText(item.quote, {
          x: 1.8, y: 2.8, w: 9.7, h: 2.0, fontFace: 'Aptos Display',
          fontSize: 27, italic: true, color: colors.text, margin: 0,
          valign: 'middle', align: 'center', fit: 'shrink',
        });
        if (item.bullets.length)
          slide.addText(item.bullets.join(' · '), { x: 1.5, y: 5.35, w: 10.3, h: 0.55, fontFace: 'Aptos', fontSize: 14, color: colors.muted, align: 'center', margin: 0, fit: 'shrink' });
      }
    }

    slide.addShape(pptx.ShapeType.line, {
      x: 0.8, y: 7.05, w: W - 1.4, h: 0,
      line: { color: colors.panel, width: 0.8 },
    });
    slide.addText(String(index + 1).padStart(2, '0') + '  /  ' + String(deck.slides.length).padStart(2, '0'), {
      x: 11.35, y: 7.12, w: 1.0, h: 0.15,
      fontFace: 'Aptos', fontSize: 8, color: colors.muted, align: 'right', margin: 0,
    });
    if (item.notes) slide.addNotes(item.notes);
  });

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(buffer as Uint8Array);
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function buildPresentationPdfHtml(deck: PresentationDeck, language: string, theme: PresentationTheme = 'emerald') {
  const colors = PALETTES[theme];
  const rtl = language === 'Urdu';
  const renderBullets = (items: string[]) => '<ul>' + items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>';
  const slides = deck.slides.map((item, index) => {
    let body = '';
    if (item.type === 'title') {
      body = '<div class="cover"><p class="eyebrow">ILM AI · LEARNING DECK</p><h1>' + esc(deck.title) + '</h1>' +
        (item.title !== deck.title ? '<p class="subtitle">' + esc(item.title) + '</p>' : '') +
        (item.bullets.length ? '<p class="tagline">' + esc(item.bullets.join(' · ')) + '</p>' : '') + '</div>';
    } else if (item.type === 'closing') {
      body = '<div class="closing"><p class="eyebrow">ILM AI</p><h1>' + esc(item.title) + '</h1>' +
        (item.bullets.length ? renderBullets(item.bullets) : '') + '</div>';
    } else if (item.type === 'two_column') {
      body = '<h2>' + esc(item.title) + '</h2><div class="columns"><section>' + renderBullets(item.left) + '</section><section>' + renderBullets(item.right) + '</section></div>';
    } else if (item.type === 'quote') {
      body = '<h2>' + esc(item.title) + '</h2><blockquote>' + esc(item.quote) + '</blockquote>' +
        (item.bullets.length ? '<p class="caption">' + esc(item.bullets.join(' · ')) + '</p>' : '');
    } else {
      body = '<h2>' + esc(item.title) + '</h2>' + renderBullets(item.bullets);
    }
    return '<article class="slide"><div class="topline"><span>ILM AI</span><span>' +
      String(index + 1).padStart(2, '0') + ' / ' + String(deck.slides.length).padStart(2, '0') +
      '</span></div><main>' + body + '</main></article>';
  }).join('');
  return '<!doctype html><html lang="' + (rtl ? 'ur' : 'en') + '" dir="' + (rtl ? 'rtl' : 'ltr') +
    '"><head><meta charset="utf-8"><style>' +
    '@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Noto Nastaliq Urdu","Noto Sans",sans-serif;direction:' +
    (rtl ? 'rtl' : 'ltr') + ';color:#' + colors.text + ';} .slide{width:13.333in;height:7.5in;position:relative;overflow:hidden;page-break-after:always;break-after:page;padding:.5in .75in;background:#' +
    colors.bg + ';display:flex;flex-direction:column}.slide:last-child{page-break-after:auto;break-after:auto}.topline{display:flex;justify-content:space-between;color:#' +
    colors.accent + ';font:700 10pt "Noto Sans",sans-serif;letter-spacing:2px;border-bottom:1px solid #' + colors.panel +
    ';padding-bottom:.18in}.slide main{flex:1;display:flex;flex-direction:column;justify-content:center}h1{font-size:36pt;line-height:1.15;margin:.3in 0;color:#' +
    colors.text + '}h2{font-size:30pt;line-height:1.15;margin:0 0 .3in;color:#' + colors.text + '}li{font-size:21pt;line-height:1.35;margin:.12in 0;color:#' +
    colors.text + '}ul{margin:0;padding-inline-start:.4in}.columns{display:grid;grid-template-columns:1fr 1fr;gap:.4in}.columns section{background:#' +
    colors.panel + ';padding:.28in;border-radius:.12in}.columns li{font-size:18pt}.eyebrow{font:700 12pt "Noto Sans",sans-serif;letter-spacing:2px;color:#' +
    colors.accent + '}.subtitle{font-size:20pt;color:#' + colors.muted + '}.tagline,.caption{font-size:15pt;color:#' +
    colors.accent + '}blockquote{margin:0 auto;max-width:10in;font-size:29pt;line-height:1.35;font-style:italic;text-align:center;color:#' +
    colors.secondary + '}.cover,.closing{text-align:center}.closing h1{margin:0 0 .3in}.closing ul{list-style:none;padding:0}.closing li{font-size:18pt;color:#' +
    colors.muted + '}</style></head><body>' + slides + '</body></html>';
}
