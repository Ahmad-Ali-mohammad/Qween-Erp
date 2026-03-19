import { api, extractRows, withToast } from '../../core/api.js';
import { setPageActions, setTitle, table } from '../../core/ui.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadCsv(filename, headers, rows) {
  const body = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function lineRowsHtml() {
  return `
    <div class="line-rows" id="line-rows">
      <div class="line-row grid cols-5" style="margin-bottom:8px;">
        <input name="lineDescription" placeholder="الوصف" required />
        <input name="lineQty" type="number" min="0.01" step="0.01" value="1" required />
        <input name="linePrice" type="number" min="0" step="0.01" value="0" required />
        <input name="lineDiscount" type="number" min="0" step="0.01" value="0" />
        <input name="lineTaxRate" type="number" min="0" max="100" step="0.01" value="15" />
      </div>
    </div>
  `;
}

export function parseLineRows(form) {
  const rows = [...form.querySelectorAll('.line-row')];
  const lines = rows
    .map((row) => ({
      description: row.querySelector('[name="lineDescription"]')?.value?.trim(),
      quantity: Number(row.querySelector('[name="lineQty"]')?.value || 0),
      unitPrice: Number(row.querySelector('[name="linePrice"]')?.value || 0),
      discount: Number(row.querySelector('[name="lineDiscount"]')?.value || 0),
      taxRate: Number(row.querySelector('[name="lineTaxRate"]')?.value || 15)
    }))
    .filter((line) => line.description && line.quantity > 0);

  if (!lines.length) {
    throw new Error('يجب إضافة بند واحد على الأقل');
  }

  return lines;
}

function formatCrudValue(value) {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return value ?? '-';
}

function renderField(field) {
  if (field.type === 'checkbox') {
    return `
      <div>
        <label>
          <input name="${field.key}" type="checkbox" ${field.defaultValue ? 'checked' : ''} />
          ${field.label}
        </label>
      </div>
    `;
  }

  return `
    <div>
      <label>${field.label}</label>
      <input
        name="${field.key}"
        ${field.type ? `type="${field.type}"` : ''}
        ${field.required ? 'required' : ''}
        ${field.defaultValue !== undefined ? `value="${escapeHtml(field.defaultValue)}"` : ''}
      />
    </div>
  `;
}

function readFieldValue(form, field) {
  const input = form[field.key];
  if (field.type === 'checkbox') return Boolean(input?.checked);
  const raw = input?.value ?? '';
  if (field.type === 'number') return Number(raw || 0);
  return raw;
}

export async function renderSimpleCrud(path, title, fields) {
  setTitle(title);
  setPageActions({});

  const view = document.getElementById('view');
  const rows = extractRows(await api(path));
  const headers = fields.map((field) => field.label).concat(['إجراءات']);
  const tableRows = rows.map((row) =>
    fields
      .map((field) => formatCrudValue(row[field.key]))
      .concat(`<button class="btn btn-danger btn-sm" data-delete="${row.id}">حذف</button>`)
  );

  view.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <form id="simple-form" class="grid cols-2">
        ${fields.map((field) => renderField(field)).join('')}
        <div style="grid-column:1/-1;"><button class="btn btn-primary" type="submit">حفظ</button></div>
      </form>
    </div>
    <div class="card">
      ${table(headers, tableRows)}
    </div>
  `;

  document.getElementById('simple-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {};
    fields.forEach((field) => {
      payload[field.key] = readFieldValue(form, field);
    });
    await withToast(() => api(path, 'POST', payload), 'تم الحفظ');
    await renderSimpleCrud(path, title, fields);
  });

  view.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await withToast(() => api(`${path}/${button.getAttribute('data-delete')}`, 'DELETE'), 'تم الحذف');
      await renderSimpleCrud(path, title, fields);
    });
  });
}
