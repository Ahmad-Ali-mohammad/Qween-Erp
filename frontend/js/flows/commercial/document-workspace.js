export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatIsoDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

export function buildEntityLabel(entity) {
  const code = entity?.code ? `${entity.code} - ` : '';
  return `${code}${entity?.nameAr || entity?.name || entity?.username || ''}`.trim();
}

export function renderLookupField({ inputId, hiddenId, listId, label, placeholder, entities, selectedId }) {
  const selectedEntity = entities.find((entity) => String(entity.id) === String(selectedId));
  const selectedLabel = selectedEntity ? buildEntityLabel(selectedEntity) : '';

  return `
    <div>
      <label>${label}</label>
      <input id="${inputId}" list="${listId}" value="${escapeHtml(selectedLabel)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
      <input id="${hiddenId}" type="hidden" value="${selectedEntity ? escapeHtml(selectedEntity.id) : ''}" />
      <datalist id="${listId}">
        ${entities.map((entity) => `<option value="${escapeHtml(buildEntityLabel(entity))}"></option>`).join('')}
      </datalist>
    </div>
  `;
}

export function bindLookupField({ inputId, hiddenId, entities, onResolved }) {
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);

  const resolve = () => {
    const raw = String(input?.value || '').trim();
    const match = entities.find((entity) => {
      const label = buildEntityLabel(entity);
      return label === raw || entity.code === raw || entity.nameAr === raw;
    });

    hidden.value = match ? String(match.id) : '';
    if (!match && !raw) hidden.value = '';
    if (onResolved) onResolved(match || null);
    return match || null;
  };

  input?.addEventListener('change', resolve);
  input?.addEventListener('blur', resolve);
  input?.addEventListener('input', () => {
    if (!input.value.trim()) {
      hidden.value = '';
      if (onResolved) onResolved(null);
    }
  });

  return {
    resolve,
    setValue(entityId) {
      const match = entities.find((entity) => String(entity.id) === String(entityId));
      input.value = match ? buildEntityLabel(match) : '';
      hidden.value = match ? String(match.id) : '';
      if (onResolved) onResolved(match || null);
    }
  };
}

function normalizeLine(line = {}) {
  return {
    description: line.description || '',
    quantity: Number(line.quantity || 1),
    unitPrice: Number(line.unitPrice || 0),
    discount: Number(line.discount || 0),
    taxRate: Number(line.taxRate ?? 15)
  };
}

export function renderLineEditorRows(lines, prefix = 'doc') {
  return lines
    .map((line, index) => {
      const normalized = normalizeLine(line);
      return `
        <tr data-line-index="${index}">
          <td><input class="${prefix}-desc" value="${escapeHtml(normalized.description)}" placeholder="وصف الصنف / الخدمة" /></td>
          <td><input class="${prefix}-qty" type="number" min="0.01" step="0.01" value="${normalized.quantity}" /></td>
          <td><input class="${prefix}-price" type="number" min="0" step="0.01" value="${normalized.unitPrice}" /></td>
          <td><input class="${prefix}-discount" type="number" min="0" step="0.01" value="${normalized.discount}" /></td>
          <td><input class="${prefix}-tax" type="number" min="0" max="100" step="0.01" value="${normalized.taxRate}" /></td>
          <td class="${prefix}-total">0.00</td>
          <td><button class="btn btn-danger btn-sm" type="button" data-remove-line="${index}">حذف</button></td>
        </tr>
      `;
    })
    .join('');
}

export function collectLineEditorRows(container, prefix = 'doc') {
  return Array.from(container.querySelectorAll('tr'))
    .map((row) => ({
      description: row.querySelector(`.${prefix}-desc`)?.value?.trim() || '',
      quantity: Number(row.querySelector(`.${prefix}-qty`)?.value || 0),
      unitPrice: Number(row.querySelector(`.${prefix}-price`)?.value || 0),
      discount: Number(row.querySelector(`.${prefix}-discount`)?.value || 0),
      taxRate: Number(row.querySelector(`.${prefix}-tax`)?.value || 0)
    }))
    .filter((line) => line.description || line.quantity || line.unitPrice);
}

export function calculateDocumentTotals(lines) {
  const normalized = lines.map((line) => normalizeLine(line));

  return normalized.reduce(
    (acc, line) => {
      const base = Math.max(0, line.quantity * line.unitPrice - line.discount);
      const taxAmount = base * (line.taxRate / 100);
      acc.subtotal += base;
      acc.taxAmount += taxAmount;
      acc.total += base + taxAmount;
      acc.lines.push({ ...line, total: base + taxAmount });
      return acc;
    },
    {
      subtotal: 0,
      taxAmount: 0,
      total: 0,
      lines: []
    }
  );
}

export function bindLineEditor({ container, state, prefix = 'doc', onChange }) {
  const rerender = () => {
    container.innerHTML = renderLineEditorRows(state.lines, prefix);
    attach();
    sync();
  };

  const sync = () => {
    state.lines = collectLineEditorRows(container, prefix);
    if (!state.lines.length) {
      state.lines = [{ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 }];
    }

    const totals = calculateDocumentTotals(state.lines);
    Array.from(container.querySelectorAll('tr')).forEach((row, index) => {
      const line = totals.lines[index];
      const totalCell = row.querySelector(`.${prefix}-total`);
      if (totalCell && line) totalCell.textContent = line.total.toFixed(2);
    });

    if (onChange) onChange(totals);
    return totals;
  };

  const attach = () => {
    container.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', sync);
    });

    container.querySelectorAll('[data-remove-line]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-remove-line'));
        state.lines.splice(index, 1);
        rerender();
      });
    });
  };

  rerender();

  return {
    rerender,
    sync,
    addLine(line = {}) {
      sync();
      state.lines.push(normalizeLine(line));
      rerender();
    },
    replaceLines(lines = []) {
      state.lines = lines.length ? lines.map((line) => normalizeLine(line)) : [{ description: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 15 }];
      rerender();
    }
  };
}
