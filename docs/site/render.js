/** Small Markdown subset used by the static legal pages. No HTML in the source. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

function headingId(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html += `<p>${inline(paragraph.join(' '))}</p>\n`;
    paragraph = [];
  }

  function closeList() {
    if (!list) return;
    html += list === 'ul' ? '</ul>\n' : '</ol>\n';
    list = null;
  }

  for (const line of lines) {
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const text = heading[2];
      html += `<h${level} id="${headingId(text)}">${inline(text)}</h${level}>\n`;
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (list !== 'ul') {
        closeList();
        html += '<ul>\n';
        list = 'ul';
      }
      html += `<li>${inline(bullet[1])}</li>\n`;
      continue;
    }
    const numbered = /^\d+\. (.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (list !== 'ol') {
        closeList();
        html += '<ol>\n';
        list = 'ol';
      }
      html += `<li>${inline(numbered[1])}</li>\n`;
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  closeList();
  return html;
}

if (typeof module !== 'undefined') module.exports = { renderMarkdown, escapeHtml };
