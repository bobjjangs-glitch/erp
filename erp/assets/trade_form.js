(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('tf-data').textContent);
  var type = D.type, API = D.api, cats = D.cats || [];
  var kids = {};
  cats.forEach(function (c) { (kids[c.p] = kids[c.p] || []).push(c); });

  function $(id) { return document.getElementById(id); }
  var form = $('tf'), elTop = $('catTop'), elSub = $('catSub'), elQ = $('q'), elList = $('itemList');
  var tbody = document.querySelector('#lines tbody');
  var elChannel = $('channel');
  var elPid = $('partnerId'), elPQ = $('partnerQ'), elPList = $('partnerList'), elPSel = $('partnerSel');
  var elPay = $('payMethod'), elAcctWrap = $('acctWrap'), elHint = $('payHint');

  var curTop = 0, curSub = 0, shown = [], more = false, itemSeq = 0, itemTimer = null, itemLoading = false;
  var curPartner = D.partner || null, pItems = [], pActive = -1, pSeq = 0, pTimer = null;
  var submitted = false;
  var GRAY = '#6b7280';

  function fmt(n) { return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '-'; }
  function toMilli(s) {
    s = String(s).replace(/[,\s]/g, '');
    if (!/^\d{1,9}(\.\d{1,3})?$/.test(s)) { return NaN; }
    var p = s.split('.');
    return parseInt(p[0], 10) * 1000 + parseInt(((p[1] || '') + '000').slice(0, 3), 10);
  }
  function toWon(s) {
    s = String(s).replace(/[,\s]/g, '');
    if (s === '') { return 0; }
    return /^\d{1,12}$/.test(s) ? parseInt(s, 10) : NaN;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  function gray(text) {
    var s = el('span', '', text);
    s.style.color = GRAY;
    return s;
  }
  function priceOf(it) {
    if (type === 'purchase') { return it.cost; }
    return (elChannel && elChannel.value === 'wholesale') ? it.wholesale : it.retail;
  }

  function getJSON(params, cb) {
    var qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    fetch(D.api + '?' + qs, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('응답 형식 오류 (로그인 만료이거나 서버 오류일 수 있습니다)'); }
        if (!j.ok) { throw new Error(j.msg || '검색에 실패했습니다.'); }
        cb(null, j);
      })
      .catch(function (e) { cb(e); });
  }

  // ---------- 분류 / 품목 ----------
  function chip(label, active, onClick) {
    var b = el('button', 'chip' + (active ? ' active' : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function renderCats() {
    elTop.textContent = '';
    elTop.appendChild(chip('전체', curTop === 0, function () { curTop = 0; curSub = 0; renderCats(); scheduleItems(0); }));
    (kids[0] || []).forEach(function (c) {
      elTop.appendChild(chip(c.n, curTop === c.id, function () { curTop = c.id; curSub = 0; renderCats(); scheduleItems(0); }));
    });
    elSub.textContent = '';
    if (curTop) {
      (kids[curTop] || []).forEach(function (c) {
        elSub.appendChild(chip(c.n, curSub === c.id, function () { curSub = (curSub === c.id ? 0 : c.id); renderCats(); scheduleItems(0); }));
      });
    }
  }
  function renderItemList() {
    elList.textContent = '';
    shown.forEach(function (it) {
      var b = el('button', 'item-btn');
      b.type = 'button';
      b.appendChild(el('span', 'nm', it.name));
      var sub = [];
      if (it.code) { sub.push(it.code); }
      var bp = [it.brand, it.pattern].filter(Boolean).join(' ');
      if (bp) { sub.push(bp); }
      if (it.spec) { sub.push(it.spec); }
      sub.push(fmt(priceOf(it)) + '원');
      if (it.stock_item) { sub.push('재고 ' + it.stock); }
      b.appendChild(el('small', '', sub.join(' · ')));
      b.addEventListener('click', function () { addLine(it, undefined, undefined, undefined, true); });
      elList.appendChild(b);
    });
    if (!shown.length) { elList.appendChild(el('div', 'empty', '검색 결과가 없습니다.')); }
    if (more) { elList.appendChild(el('div', 'empty', '결과가 많아 일부만 표시합니다. 검색어나 분류를 더 좁혀 주세요.')); }
  }
  function loadItems() {
    var my = ++itemSeq;
    itemLoading = true;
    getJSON({ 'do': 'items', type: type, q: elQ.value, cat: curSub || curTop || 0 }, function (err, j) {
      if (my !== itemSeq) { return; }
      itemLoading = false;
      if (err) {
        shown = []; more = false;
        elList.textContent = '';
        elList.appendChild(el('div', 'empty', err.message));
        return;
      }
      shown = j.items || [];
      more = !!j.more;
      renderItemList();
    });
  }
  function scheduleItems(delay) {
    itemLoading = true;
    clearTimeout(itemTimer);
    itemTimer = setTimeout(loadItems, delay);
  }

  // ---------- 전표 줄 ----------
  function addLine(it, qty, price, memo, userAdded) {
    if (userAdded) {
      var rows = tbody.querySelectorAll('tr');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].dataset.item === String(it.id)) {
          var qi = rows[i].querySelector('.qty');
          var cur = toMilli(qi.value);
          qi.value = Number.isFinite(cur) ? String(Math.floor(cur / 1000) + 1) : '1';
          qi.focus(); qi.select(); recalc();
          return;
        }
      }
      qty = '1';
      price = String(priceOf(it));
      memo = '';
    }
    var tr = document.createElement('tr');
    tr.dataset.item = String(it.id);
    tr.dataset.tax = it.tax || 'taxable';

    var td1 = el('td');
    td1.appendChild(el('strong', '', it.name));
    if (it.spec) { td1.appendChild(el('small', 'sub', ' ' + it.spec)); }
    if (it.active === false) {
      var w = el('small', 'sub', ' (사용 중지 품목)');
      w.style.color = '#dc2626';
      td1.appendChild(w);
    }
    var hid = el('input'); hid.type = 'hidden'; hid.name = 'item_id[]'; hid.value = String(it.id);
    td1.appendChild(hid);

    var td2 = el('td', 'num'); var iq = el('input', 'qty'); iq.name = 'qty[]'; iq.value = qty; iq.inputMode = 'decimal'; td2.appendChild(iq);
    var td3 = el('td', 'num'); var ip = el('input', 'price'); ip.name = 'unit_price[]'; ip.value = price; ip.inputMode = 'numeric'; td3.appendChild(ip);
    var td4 = el('td', 'num amt', '0');
    var td5 = el('td'); var im = el('input'); im.name = 'memo[]'; im.value = memo || ''; im.maxLength = 200; td5.appendChild(im);
    var td6 = el('td'); var rm = el('button', 'btn btn-sm', '삭제'); rm.type = 'button';
    rm.addEventListener('click', function () { tr.remove(); recalc(); });
    td6.appendChild(rm);

    [td1, td2, td3, td4, td5, td6].forEach(function (td) { tr.appendChild(td); });
    iq.addEventListener('input', recalc);
    ip.addEventListener('input', recalc);
    tbody.appendChild(tr);
    recalc();
    if (userAdded) { iq.focus(); iq.select(); }
  }

  function recalc() {
    var supply = 0, taxable = 0, bad = false;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      var qm = toMilli(tr.querySelector('.qty').value);
      var pr = toWon(tr.querySelector('.price').value);
      var cell = tr.querySelector('.amt');
      if (!Number.isFinite(qm) || qm <= 0 || !Number.isFinite(pr)) {
        cell.textContent = '입력 오류'; cell.classList.add('err'); bad = true; return;
      }
      cell.classList.remove('err');
      var amt = Math.floor((qm * pr + 500) / 1000);
      cell.textContent = fmt(amt);
      supply += amt;
      if (tr.dataset.tax === 'taxable') { taxable += amt; }
    });
    var vat = Math.floor((taxable + 5) / 10);
    $('tSupply').textContent = bad ? '-' : fmt(supply);
    $('tVat').textContent = bad ? '-' : fmt(vat);
    $('tTotal').textContent = bad ? '-' : fmt(supply + vat);
  }

  // ---------- 거래처 선택 ----------
  function renderPartnerSel() {
    elPid.value = curPartner ? String(curPartner.id) : '0';
    elPSel.textContent = '';
    if (!curPartner) { elPSel.appendChild(el('span', '', '선택 안 함')); return; }
    var p = curPartner;
    if (p.code) { elPSel.appendChild(gray('[' + p.code + '] ')); }
    elPSel.appendChild(el('strong', '', p.name));
    var meta = [];
    if (p.region) { meta.push(p.region); }
    if (p.biz) { meta.push(p.biz); }
    if (meta.length) { elPSel.appendChild(gray(' (' + meta.join(' · ') + ')')); }
    if (p.credit) { var c = el('span', 'cr', ' · 외상 거래처'); c.style.color = '#92400e'; elPSel.appendChild(c); }
    if (type === 'sale' && p.credit && typeof p.balance === 'number') {
      elPSel.appendChild(el('span', '', ' · 현 미수금 ' + fmt(p.balance) + '원'));
    }
    var warn = '';
    if (p.active === false) { warn = ' · 사용 중지된 거래처입니다. 다른 거래처를 선택하세요.'; }
    else if (p.type_ok === false) { warn = type === 'purchase' ? ' · 매입처가 아닙니다.' : ' · 매출처가 아닙니다.'; }
    if (warn) { var w = el('span', '', warn); w.style.color = '#dc2626'; elPSel.appendChild(w); }
    var x = el('button', 'btn btn-sm', '해제'); x.type = 'button'; x.style.marginLeft = '8px';
    x.addEventListener('click', function () { clearPartner(); elPQ.focus(); });
    elPSel.appendChild(x);
  }
  function clearPartner() {
    curPartner = null;
    renderPartnerSel();
    syncPay();
  }
  function loadPartnerDetail(id) {
    getJSON({ 'do': 'partner', id: id, type: type }, function (err, j) {
      if (err || !curPartner || curPartner.id !== id) { return; }
      var p = j.partner;
      if (typeof j.balance === 'number') { p.balance = j.balance; }
      curPartner = p;
      renderPartnerSel();
      syncPay();
    });
  }
  function pickPartner(p) {
    curPartner = p;
    elPQ.value = '';
    elPList.hidden = true;
    renderPartnerSel();
    if (type === 'sale' && elChannel && (p.channel === 'retail' || p.channel === 'wholesale')) {
      elChannel.value = p.channel;
      renderItemList();
    }
    syncPay();
    loadPartnerDetail(p.id);
  }
  function setActive(i) {
    var bs = elPList.querySelectorAll('button');
    if (!bs.length) { pActive = -1; return; }
    pActive = (i + bs.length) % bs.length;
    for (var k = 0; k < bs.length; k++) { bs[k].classList.toggle('on', k === pActive); }
    bs[pActive].scrollIntoView({ block: 'nearest' });
  }
  function renderPList(list, msg, hasMore) {
    elPList.textContent = '';
    pItems = list || [];
    pActive = -1;
    if (msg) { elPList.appendChild(el('div', 'pk-empty', msg)); }
    else if (!pItems.length) { elPList.appendChild(el('div', 'pk-empty', '검색 결과가 없습니다.')); }
    pItems.forEach(function (p) {
      var b = el('button', '');
      b.type = 'button';
      if (p.code) { b.appendChild(gray(p.code + '  ')); }
      b.appendChild(el('strong', '', p.name));
      var meta = [];
      if (p.region) { meta.push(p.region); }
      if (p.biz) { meta.push(p.biz); }
      if (p.ceo) { meta.push('대표 ' + p.ceo); }
      if (meta.length) { b.appendChild(gray('  ' + meta.join(' · '))); }
      if (p.credit) {
        var cr = el('span', '', '  [외상]');
        cr.style.color = '#92400e';
        b.appendChild(cr);
      }
      b.addEventListener('click', function () { pickPartner(p); });
      elPList.appendChild(b);
    });
    if (hasMore) { elPList.appendChild(el('div', 'pk-empty', '결과가 많아 일부만 표시합니다. 검색어를 더 입력하세요.')); }
    elPList.hidden = false;
  }
  function searchPartners() {
    var my = ++pSeq;
    getJSON({ 'do': 'partners', type: type, q: elPQ.value }, function (err, j) {
      if (my !== pSeq) { return; }
      if (err) { renderPList([], err.message, false); return; }
      renderPList(j.partners, null, !!j.more);
    });
  }
  elPQ.addEventListener('input', function () { clearTimeout(pTimer); pTimer = setTimeout(searchPartners, 200); });
  elPQ.addEventListener('focus', function () { if (elPList.hidden) { searchPartners(); } });
  elPQ.addEventListener('keydown', function (e) {
    if (e.isComposing) { return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (elPList.hidden) { searchPartners(); } else { setActive(pActive + 1); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(pActive - 1); }
    else if (e.key === 'Escape') { elPList.hidden = true; }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (!elPList.hidden && pItems.length) { pickPartner(pItems[pActive >= 0 ? pActive : 0]); }
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target !== elPQ && !elPList.contains(e.target)) { elPList.hidden = true; }
  });

  // ---------- 결제수단 / 계좌 / 안내 ----------
  function hintNodes(nodes) {
    elHint.textContent = '';
    nodes.forEach(function (n) { elHint.appendChild(n); });
    elHint.style.display = nodes.length ? '' : 'none';
  }
  function syncPay() {
    if (!elPay) { return; }
    var credit = !!(curPartner && curPartner.credit);
    var nodes = [];

    if (type === 'sale') {
      var creditOk = !!D.hasCredit && credit;
      for (var i = 0; i < elPay.options.length; i++) {
        var o = elPay.options[i], v = o.value;
        if (v === 'credit') { o.disabled = !creditOk; }
        else if (v === 'cash' || v === 'transfer' || v === 'card') { o.disabled = creditOk && !D.paidNow; }
      }
      if (elPay.options[elPay.selectedIndex].disabled) { elPay.value = creditOk ? 'credit' : ''; }
      if (creditOk && elPay.value === '') { elPay.value = 'credit'; }

      if (!D.hasCredit) {
        nodes.push(el('span', '', '외상 기능이 아직 설정되지 않았습니다 (거래처 외상 컬럼 없음). 관리자에게 문의하세요.'));
      } else if (!curPartner) {
        nodes.push(el('span', '', '"외상"은 거래처를 선택하고, 그 거래처가 외상 거래처로 지정되어 있어야 선택할 수 있습니다.'));
      } else if (!credit) {
        nodes.push(el('span', '', '이 거래처는 외상 거래처로 지정되어 있지 않아 "외상"을 선택할 수 없습니다. '));
        var a = el('a', '', '거래처 화면에서 외상 지정');
        a.href = 'partners.php?edit=' + curPartner.id; a.target = '_blank'; a.rel = 'noopener';
        nodes.push(a);
        nodes.push(el('span', '', ' 후 '));
        var rb = el('button', 'btn btn-sm', '지정 후 다시 확인'); rb.type = 'button';
        rb.addEventListener('click', function () { loadPartnerDetail(curPartner.id); });
        nodes.push(rb);
      } else {
        nodes.push(el('span', '', '외상 거래처입니다. 결제수단은 "외상"으로 저장하며, 확정하면 미수금에 잡힙니다. 나중에 받은 돈은 입금등록에서 처리하세요.'));
      }
    }
    hintNodes(nodes);

    if (elAcctWrap) {
      var pv = elPay.value;
      elAcctWrap.style.display = (pv === 'cash' || pv === 'transfer' || pv === 'card') ? '' : 'none';
    }
  }

  // ---------- 이벤트 ----------
  elQ.addEventListener('input', function () { scheduleItems(250); });
  form.addEventListener('keydown', function (e) {
    if (e.isComposing || e.key !== 'Enter' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') { return; }
    e.preventDefault();
    if (e.target === elQ) {
      if (!itemLoading && shown.length) { addLine(shown[0], undefined, undefined, undefined, true); elQ.value = ''; scheduleItems(0); }
    } else if (e.target.tagName === 'INPUT') {
      elQ.focus();
    }
  });
  if (elChannel) {
    elChannel.addEventListener('change', function () { renderItemList(); syncPay(); });
  }
  if (elPay) { elPay.addEventListener('change', syncPay); }
  form.addEventListener('submit', function (e) {
    if (submitted) { e.preventDefault(); return; }
    if (!tbody.querySelector('tr')) { e.preventDefault(); alert('품목을 한 개 이상 추가하세요.'); return; }
    if (tbody.querySelector('.amt.err')) { e.preventDefault(); alert('수량 또는 단가가 잘못된 줄이 있습니다. "입력 오류"로 표시된 줄을 고쳐 주세요.'); return; }
    var needPartner = type === 'purchase' || (elChannel && elChannel.value === 'wholesale');
    if (needPartner && !curPartner) { e.preventDefault(); alert('매입·도매 전표는 거래처를 선택해야 합니다.'); elPQ.focus(); return; }
    submitted = true;
  });
  // 뒤로가기로 돌아왔을 때 제출 잠금 해제
  window.addEventListener('pageshow', function () { submitted = false; });

  // ---------- 초기화 ----------
  renderCats();
  scheduleItems(0);
  (D.lines || []).forEach(function (l) {
    addLine({ id: l.item_id, name: l.name, spec: l.spec, tax: l.tax, active: l.active }, l.qty, l.unit_price, l.memo, false);
  });
  renderPartnerSel();
  syncPay();
  if (curPartner) { loadPartnerDetail(curPartner.id); }
})();
