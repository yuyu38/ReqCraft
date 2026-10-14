(function () {
  'use strict';

  var SAMPLE_CURL = [
    "curl 'https://api.example.com/v1/search?q=%E4%B8%AD%E6%96%87%20test&page=1&sort=recent' \\",
    "  -X POST \\",
    "  -H 'Content-Type: application/json' \\",
    "  -H 'Accept: application/json' \\",
    "  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ReqCraft/1.0' \\",
    "  -b 'session_id=abc123; theme=dark' \\",
    "  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.exampletoken' \\",
    "  --data-raw '{\"keywords\":\"hello \\\"quoted\\\" world\",\"limit\":10,\"tags\":[\"a\",\"b\"]}' \\",
    '  --compressed'
  ].join('\n');

  var LANG_LABELS = { python: 'Python requests', fetch: 'JavaScript fetch', curl: 'cURL' };

  var els = {};
  var state = {
    parsed: null,
    lang: 'python',
    headerFmt: 'json'
  };

  function onReady() {
    els.curlInput = document.getElementById('curlInput');
    els.parseBtn = document.getElementById('parseBtn');
    els.sampleBtn = document.getElementById('sampleBtn');
    els.clearBtn = document.getElementById('clearBtn');
    els.parseStatus = document.getElementById('parseStatus');
    els.codeOutput = document.getElementById('codeOutput');
    els.codeEmpty = document.getElementById('codeEmpty');
    els.codeWarnings = document.getElementById('codeWarnings');
    els.copyCodeBtn = document.getElementById('copyCodeBtn');
    els.requestInfo = document.getElementById('requestInfo');
    els.headerInput = document.getElementById('headerInput');
    els.headerOutput = document.getElementById('headerOutput');
    els.headerStatus = document.getElementById('headerStatus');
    els.copyHeaderBtn = document.getElementById('copyHeaderBtn');

    els.parseBtn.addEventListener('click', runParse);
    els.sampleBtn.addEventListener('click', loadSample);
    els.clearBtn.addEventListener('click', clearAll);

    var langTabs = document.querySelectorAll('.code-panel .tab');
    for (var i = 0; i < langTabs.length; i++) {
      langTabs[i].addEventListener('click', function (e) {
        setLang(e.currentTarget.getAttribute('data-lang'));
      });
    }

    var fmtTabs = document.querySelectorAll('.headers-panel .tab');
    for (var j = 0; j < fmtTabs.length; j++) {
      fmtTabs[j].addEventListener('click', function (e) {
        setHeaderFmt(e.currentTarget.getAttribute('data-hfmt'));
      });
    }

    els.copyCodeBtn.addEventListener('click', function () {
      copyText(els.codeOutput.textContent, els.copyCodeBtn, '已复制');
    });
    els.copyHeaderBtn.addEventListener('click', function () {
      copyText(els.headerOutput.textContent, els.copyHeaderBtn, '已复制');
    });

    var debounceTimer = null;
    els.curlInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runParse, 500);
    });
    els.headerInput.addEventListener('input', runHeaderConvert);

    setLang('python');
    setHeaderFmt('json');
  }

  function setLang(lang) {
    state.lang = lang;
    var tabs = document.querySelectorAll('.code-panel .tab');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute('data-lang') === lang;
      tabs[i].classList.toggle('is-active', active);
    }
    renderCode();
  }

  function setHeaderFmt(fmt) {
    state.headerFmt = fmt;
    var tabs = document.querySelectorAll('.headers-panel .tab');
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute('data-hfmt') === fmt;
      tabs[i].classList.toggle('is-active', active);
    }
    runHeaderConvert();
  }

  function loadSample() {
    els.curlInput.value = SAMPLE_CURL;
    runParse();
  }

  function clearAll() {
    els.curlInput.value = '';
    state.parsed = null;
    renderStatus([{ level: 'info', message: '输入已清空' }]);
    els.parseStatus.hidden = false;
    renderCode();
    renderRequestInfo();
  }

  function runParse() {
    var input = els.curlInput.value;
    if (!input || !input.trim()) {
      state.parsed = null;
      renderStatus([{ level: 'error', message: '输入为空：请先粘贴浏览器复制的 cURL 命令' }]);
      els.parseStatus.hidden = false;
      renderCode();
      renderRequestInfo();
      return;
    }
    var parsed = ReqCraft.parseCurl(input);
    state.parsed = parsed;
    renderStatus(parsed.errors.concat(parsed.warnings), parsed.ok && !parsed.blocked);
    els.parseStatus.hidden = false;
    renderCode();
    renderRequestInfo();
  }

  function msgNode(msg, level) {
    var div = document.createElement('div');
    div.className = 'msg ' + (level === 'error' ? 'msg-error' : level === 'warn' ? 'msg-warn' : 'msg-info');
    div.textContent = msg;
    return div;
  }

  function renderStatus(messages, ok) {
    els.parseStatus.textContent = '';
    if (ok !== undefined) {
      var head = document.createElement('div');
      head.className = 'msg ' + (ok ? 'msg-ok' : 'msg-error');
      head.textContent = ok ? '✓ 解析成功' : '✗ 解析失败';
      els.parseStatus.appendChild(head);
    }
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var level = m.level === 'error' ? 'error' : (m.level === 'warn' ? 'warn' : 'info');
      if (m.level !== 'error' && m.level !== 'warn') level = 'info';
      els.parseStatus.appendChild(msgNode(m.message, level));
    }
  }

  function renderCode() {
    var parsed = state.parsed;
    if (!parsed || !parsed.ok) {
      els.codeOutput.textContent = '';
      els.codeOutput.classList.add('empty');
      els.codeEmpty.hidden = false;
      els.codeWarnings.hidden = true;
      if (parsed && parsed.blocked) {
        els.codeWarnings.textContent = '';
        els.codeWarnings.appendChild(msgNode('已阻止代码生成：请求包含无法可靠转换的选项（见上方错误）', 'error'));
        els.codeWarnings.hidden = false;
        els.codeEmpty.hidden = true;
        els.codeOutput.textContent = '';
        els.codeOutput.classList.add('empty');
      }
      return;
    }
    var gen = ReqCraft.generateCode(state.lang, parsed);
    els.codeEmpty.hidden = true;
    els.codeOutput.classList.remove('empty');
    if (gen.ok) {
      els.codeOutput.textContent = gen.code;
    } else {
      els.codeWarnings.textContent = '';
      els.codeWarnings.appendChild(msgNode('无法生成代码：' + (gen.error || '未知错误'), 'error'));
      els.codeWarnings.hidden = false;
      els.codeOutput.textContent = '';
      return;
    }
    els.codeWarnings.textContent = '';
    var count = gen.warnings.length;
    var okMsg = document.createElement('div');
    okMsg.className = 'msg msg-ok';
    okMsg.textContent = '✓ 已生成 ' + LANG_LABELS[state.lang] + ' 代码' + (count ? '（' + count + ' 条提示）' : '');
    els.codeWarnings.appendChild(okMsg);
    for (var i = 0; i < gen.warnings.length; i++) {
      var w = gen.warnings[i];
      els.codeWarnings.appendChild(msgNode(w.message, w.level));
    }
    els.codeWarnings.hidden = false;
  }

  function renderRequestInfo() {
    var parsed = state.parsed;
    els.requestInfo.textContent = '';
    if (!parsed || !parsed.ok) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '解析成功后，请求方法、URL、参数、Headers、Cookies 和 Body 会显示在这里';
      els.requestInfo.appendChild(empty);
      return;
    }
    var r = parsed.request;
    var wrap = document.createElement('div');

    var overview = document.createElement('div');
    overview.className = 'req-overview';
    var badge = document.createElement('span');
    badge.className = 'method-badge';
    badge.textContent = r.method;
    var urlEl = document.createElement('span');
    urlEl.className = 'req-url';
    urlEl.textContent = r.url;
    overview.appendChild(badge);
    overview.appendChild(urlEl);
    wrap.appendChild(overview);

    if (r.query.length) {
      wrap.appendChild(section('Query 参数', table(r.query.map(function (q) {
        return [q.key, q.raw];
      }), true), r.query.map(function (q) { return q.raw; }).join('&')));
    }

    if (r.headers.length) {
      wrap.appendChild(section('Headers', table(r.headers.map(function (h) {
        return [h.name, h.value];
      })), r.headers.map(function (h) { return h.name + ': ' + h.value; }).join('\n')));
    }

    if (r.cookies.length) {
      wrap.appendChild(section('Cookies', table(r.cookies.map(function (c) {
        return [c.name, c.value];
      })), r.cookies.map(function (c) { return c.name + '=' + c.value; }).join('; ')));
    }

    if (r.body !== null) {
      var bodyPre = document.createElement('pre');
      bodyPre.className = 'req-body';
      bodyPre.textContent = r.body;
      var copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-ghost req-body-copy';
      copyBtn.type = 'button';
      copyBtn.textContent = '复制 Body';
      copyBtn.addEventListener('click', function () {
        copyText(r.body, copyBtn, '已复制');
      });
      bodyPre.appendChild(copyBtn);
      wrap.appendChild(section('请求体', bodyPre));
    }

    els.requestInfo.appendChild(wrap);
  }

  function section(title, content, copyTextValue) {
    var s = document.createElement('div');
    s.className = 'req-section';
    var t = document.createElement('div');
    t.className = 'req-section-title';
    var titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    t.appendChild(titleSpan);
    if (copyTextValue) {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-ghost';
      copyBtn.type = 'button';
      copyBtn.textContent = '复制';
      copyBtn.addEventListener('click', function () {
        copyText(copyTextValue, copyBtn, '已复制');
      });
      t.appendChild(copyBtn);
    }
    s.appendChild(t);
    s.appendChild(content);
    return s;
  }

  function table(rows) {
    var t = document.createElement('table');
    t.className = 'req-table';
    for (var i = 0; i < rows.length; i++) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = rows[i][0];
      var td = document.createElement('td');
      td.textContent = rows[i][1] === undefined ? '' : rows[i][1];
      tr.appendChild(th);
      tr.appendChild(td);
      t.appendChild(tr);
    }
    return t;
  }

  function runHeaderConvert() {
    var input = els.headerInput.value;
    if (!input.trim()) {
      els.headerOutput.textContent = '';
      els.headerStatus.hidden = true;
      return;
    }
    var result = ReqCraft.convertHeaders(input, state.headerFmt);
    els.headerStatus.textContent = '';
    if (result.ok) {
      els.headerOutput.textContent = result.output;
      els.headerStatus.hidden = false;
      var head = document.createElement('div');
      head.className = 'msg msg-ok';
      head.textContent = '✓ 转换成功';
      els.headerStatus.appendChild(head);
      for (var i = 0; i < result.warnings.length; i++) {
        els.headerStatus.appendChild(msgNode(result.warnings[i].message, result.warnings[i].level));
      }
    } else {
      els.headerOutput.textContent = '';
      els.headerStatus.hidden = false;
      var err = document.createElement('div');
      err.className = 'msg msg-error';
      err.textContent = result.errors.length ? result.errors[0].message : '转换失败';
      els.headerStatus.appendChild(err);
      for (var j = 0; j < result.warnings.length; j++) {
        els.headerStatus.appendChild(msgNode(result.warnings[j].message, result.warnings[j].level));
      }
    }
  }

  function copyText(text, btn, label) {
    if (!text) return;
    var done = function () {
      var original = btn.textContent;
      btn.classList.add('is-copied');
      btn.textContent = label;
      setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove('is-copied');
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* noop */
    }
    document.body.removeChild(ta);
    done();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();