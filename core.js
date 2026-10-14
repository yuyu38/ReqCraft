(function (global) {
  'use strict';

  var VALUE_OPTIONS = {
    '-X': 'method', '--request': 'method',
    '-H': 'header', '--header': 'header',
    '-b': 'cookie', '--cookie': 'cookie',
    '-d': 'data', '--data': 'data', '--data-ascii': 'data',
    '--data-raw': 'dataRaw', '--data-binary': 'dataBinary',
    '--data-urlencode': 'dataUrlencode',
    '--json': 'json',
    '-A': 'userAgent', '--user-agent': 'userAgent',
    '-e': 'referer', '--referer': 'referer',
    '-u': 'user', '--user': 'user',
    '--url': 'url',
    '-F': 'form', '--form': 'form', '--form-string': 'form',
    '-m': 'ignoreValue', '--max-time': 'ignoreValue',
    '--connect-timeout': 'ignoreValue', '--max-redirs': 'ignoreValue',
    '--retry': 'ignoreValue', '--retry-delay': 'ignoreValue', '--retry-max-time': 'ignoreValue',
    '-o': 'ignoreValue', '--output': 'ignoreValue',
    '-w': 'ignoreValue', '--write-out': 'ignoreValue',
    '--resolve': 'ignoreValue', '--interface': 'ignoreValue', '--dns-servers': 'ignoreValue',
    '--max-filesize': 'ignoreValue', '--speed-limit': 'ignoreValue', '--speed-time': 'ignoreValue',
    '--proto': 'ignoreValue', '--proto-redir': 'ignoreValue', '--tls-max': 'ignoreValue',
    '--noproxy': 'ignoreValue',
    '--proxy': 'unsupportedValue', '--proxy-header': 'unsupportedValue',
    '--preproxy': 'unsupportedValue',
    '--cert': 'unsupportedValue', '--key': 'unsupportedValue', '--cacert': 'unsupportedValue',
    '--capath': 'unsupportedValue', '--ssl-reqd': 'unsupportedValue',
    '-': 'stdin'
  };

  var FLAG_OPTIONS = {
    '-G': 'get', '--get': 'get',
    '-I': 'head', '--head': 'head',
    '-k': 'insecure', '--insecure': 'insecure',
    '-L': 'location', '--location': 'location',
    '--compressed': 'compressed'
  };

  var IGNORE_FLAGS = {
    '-s': 1, '--silent': 1, '-S': 1, '--show-error': 1,
    '-v': 1, '--verbose': 1, '-i': 1, '--include': 1,
    '-f': 1, '--fail': 1, '--fail-with-body': 1,
    '-#': 1, '--progress-bar': 1,
    '-q': 1, '--disable': 1,
    '--no-keepalive': 1, '--path-as-is': 1,
    '--tr-encoding': 1, '--http1.1': 1, '--http2': 1,
    '--ipv4': 1, '--ipv6': 1, '--lazy': 1
  };

  function detectCaretMode(input) {
    return /(^|\s)\^"/m.test(input) ||
      /\^[ \t]*\r?\n/.test(input) ||
      /(^|[\s("'=])\^[\^&|<>]/m.test(input);
  }

  function caretUnescape(input) {
    var out = '';
    for (var i = 0; i < input.length; i++) {
      var c = input.charAt(i);
      if (c === '^') {
        var n = input.charAt(i + 1);
        if (n === '') {
          out += c;
        } else if (n === '\n') {
          i++;
        } else if (n === '\r') {
          if (input.charAt(i + 2) === '\n') i += 2;
          else i++;
        } else {
          out += n;
          i++;
        }
      } else {
        out += c;
      }
    }
    return out;
  }

  function tokenizeCmd(input) {
    var tokens = [];
    var errors = [];
    var cur = '';
    var started = false;
    var inQuotes = false;
    var i = 0;

    function flush() {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
    }

    while (i < input.length) {
      var c = input.charAt(i);
      if (!inQuotes && (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v')) {
        flush();
        i++;
        continue;
      }
      if (c === '\\') {
        var n = 0;
        while (input.charAt(i + n) === '\\') n++;
        var next = input.charAt(i + n);
        if (next === '"') {
          var half = Math.floor(n / 2);
          for (var bi = 0; bi < half; bi++) cur += '\\';
          started = true;
          if (n % 2 === 1) {
            cur += '"';
          } else {
            inQuotes = !inQuotes;
          }
          i += n + 1;
        } else {
          for (var bj = 0; bj < n; bj++) cur += '\\';
          started = true;
          i += n;
        }
        continue;
      }
      if (c === '"') {
        if (inQuotes && input.charAt(i + 1) === '"') {
          cur += '"';
          started = true;
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        started = true;
        i++;
        continue;
      }
      cur += c;
      started = true;
      i++;
    }

    if (inQuotes) {
      errors.push({ level: 'error', message: '引号未闭合（Windows cmd 转义格式）' });
    }
    flush();
    return { tokens: tokens, errors: errors };
  }

  function tokenizeBash(input) {
    var tokens = [];
    var errors = [];
    var i = 0;
    var cur = '';
    var started = false;
    var state = 'plain';

    function flush() {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
    }

    var ANSI_ESCAPES = {
      n: '\n', r: '\r', t: '\t', a: '\x07', b: '\x08',
      f: '\x0c', v: '\x0b', '\\': '\\', "'": "'", '"': '"', '$': '$', '`': '`'
    };

    for (i = 0; i < input.length; i++) {
      var ch = input.charAt(i);

      if (state === 'single') {
        if (ch === "'") {
          state = 'plain';
        } else {
          cur += ch;
        }
        continue;
      }

      if (state === 'ansi') {
        if (ch === '\\') {
          var ed = input.charAt(i + 1);
          if (ed === '\n') {
            i++;
          } else if (ed === '') {
            errors.push({ level: 'error', message: '输入末尾存在孤立的反斜杠（\\），引号或续行可能不完整' });
            cur += ch;
          } else if (ed === 'x') {
            var hex = '';
            var hj = i + 2;
            while (hex.length < 2 && /[0-9a-fA-F]/.test(input.charAt(hj))) {
              hex += input.charAt(hj);
              hj++;
            }
            if (hex) {
              cur += String.fromCharCode(parseInt(hex, 16));
              i = hj - 1;
            } else {
              cur += 'x';
              i++;
            }
          } else if (ed === 'u') {
            var uhex = '';
            var uj = i + 2;
            while (uhex.length < 4 && /[0-9a-fA-F]/.test(input.charAt(uj))) {
              uhex += input.charAt(uj);
              uj++;
            }
            if (uhex) {
              cur += String.fromCharCode(parseInt(uhex, 16));
              i = uj - 1;
            } else {
              cur += 'u';
              i++;
            }
          } else if (/[0-7]/.test(ed)) {
            var oct = '';
            var oj = i + 1;
            while (oj < i + 4 && /[0-7]/.test(input.charAt(oj))) {
              oct += input.charAt(oj);
              oj++;
            }
            cur += String.fromCharCode(parseInt(oct, 8));
            i = oj - 1;
          } else if (ANSI_ESCAPES[ed] !== undefined) {
            cur += ANSI_ESCAPES[ed];
            i++;
          } else {
            cur += ed;
            i++;
          }
        } else if (ch === "'") {
          state = 'plain';
        } else {
          cur += ch;
        }
        continue;
      }

      if (state === 'double') {
        if (ch === '\\') {
          var nd = input.charAt(i + 1);
          if (nd === '\n') {
            i++;
          } else if (nd === '"' || nd === '\\' || nd === '`' || nd === '$') {
            cur += nd;
            i++;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          state = 'plain';
        } else {
          cur += ch;
        }
        continue;
      }

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v') {
        flush();
        continue;
      }

      if (ch === '$' && input.charAt(i + 1) === "'") {
        state = 'ansi';
        started = true;
        i++;
        continue;
      }

      if (ch === "'") {
        state = 'single';
        started = true;
        continue;
      }

      if (ch === '"') {
        state = 'double';
        started = true;
        continue;
      }

      if (ch === '\\') {
        var nl = input.charAt(i + 1);
        if (nl === '\n') {
          i++;
          continue;
        }
        if (nl === '') {
          errors.push({ level: 'error', message: '输入末尾存在孤立的反斜杠（\\），引号或续行可能不完整' });
          cur += ch;
          started = true;
          continue;
        }
        cur += nl;
        i++;
        started = true;
        continue;
      }

      cur += ch;
      started = true;
    }

    if (state === 'single') {
      errors.push({ level: 'error', message: '单引号未闭合：请检查输入中的 \' 是否成对' });
    } else if (state === 'double') {
      errors.push({ level: 'error', message: '双引号未闭合：请检查输入中的 " 是否成对' });
    } else if (state === 'ansi') {
      errors.push({ level: 'error', message: '单引号未闭合：请检查 $\'...\' 引用是否成对' });
    }
    flush();
    return { tokens: tokens, errors: errors };
  }

  function tokenize(input) {
    if (detectCaretMode(input)) {
      var cmd = tokenizeCmd(caretUnescape(input));
      cmd.caretMode = true;
      return cmd;
    }
    var bash = tokenizeBash(input);
    bash.caretMode = false;
    return bash;
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var cp = str.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
          i++;
        }
      }
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return out;
  }

  var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64Encode(str) {
    var bytes = utf8Bytes(str);
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
      out += B64_CHARS[b0 >> 2];
      out += B64_CHARS[((b0 & 3) << 4) | (b1 === null ? 0 : b1 >> 4)];
      out += b1 === null ? '=' : B64_CHARS[((b1 & 15) << 2) | (b2 === null ? 0 : b2 >> 6)];
      out += b2 === null ? '=' : B64_CHARS[b2 & 63];
    }
    return out;
  }

  function safeDecode(part) {
    try {
      return decodeURIComponent(part.replace(/\+/g, ' '));
    } catch (e) {
      return part;
    }
  }

  function parseQuery(search) {
    var raw = search.charAt(0) === '?' ? search.slice(1) : search;
    if (!raw) return [];
    var items = [];
    var parts = raw.split('&');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '') continue;
      var eq = parts[i].indexOf('=');
      var k = eq === -1 ? parts[i] : parts[i].slice(0, eq);
      var v = eq === -1 ? '' : parts[i].slice(eq + 1);
      items.push({ key: safeDecode(k), value: safeDecode(v), raw: parts[i] });
    }
    return items;
  }

  function encodeDataUrlencode(value) {
    if (value.charAt(0) === '@') {
      return { error: value };
    }
    if (value.charAt(0) === '=') {
      return { text: '=' + encodeURIComponent(value.slice(1)) };
    }
    var eq = value.indexOf('=');
    if (eq > 0) {
      return { text: value.slice(0, eq + 1) + encodeURIComponent(value.slice(eq + 1)) };
    }
    return { text: encodeURIComponent(value) };
  }

  function findHeader(headers, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].name.toLowerCase() === lower) return headers[i];
    }
    return null;
  }

  function ensureHeader(headers, name, value) {
    var existing = findHeader(headers, name);
    if (existing) {
      if (existing.value === value) return false;
      return 'conflict';
    }
    headers.push({ name: name, value: value });
    return true;
  }

  function parseCookiePairs(str) {
    var out = [];
    var segs = str.split(';');
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i].trim();
      if (!seg) continue;
      var eq = seg.indexOf('=');
      if (eq === -1) {
        out.push({ name: seg, value: '', malformed: true });
      } else {
        out.push({ name: seg.slice(0, eq).trim(), value: seg.slice(eq + 1).trim() });
      }
    }
    return out;
  }

  function parseCurl(input) {
    var result = {
      ok: false,
      blocked: false,
      errors: [],
      warnings: [],
      request: null,
      meta: null
    };

    if (input === null || input === undefined || String(input).trim() === '') {
      result.errors.push({ level: 'error', message: '输入为空：请先粘贴浏览器复制的 cURL 命令' });
      return result;
    }

    var lex = tokenize(String(input));
    if (lex.errors.length) {
      result.errors = lex.errors;
      return result;
    }
    var tokens = lex.tokens;
    if (!tokens.length) {
      result.errors.push({ level: 'error', message: '未能从输入中解析出任何内容' });
      return result;
    }

    var state = {
      headers: [],
      cookies: [],
      dataParts: [],
      urlCandidates: [],
      explicitMethod: null,
      getFlag: false,
      headFlag: false,
      insecure: false,
      location: false,
      compressed: false,
      ignored: {},
      blocked: false
    };

    var first = tokens[0];
    var firstLower = first.toLowerCase();
    var start = 1;
    if (firstLower === 'curl' || firstLower === 'curl.exe' || /(^|[\\/])curl(\.exe)?$/i.test(first)) {
      start = 1;
    } else {
      start = 0;
      result.warnings.push({
        level: 'info',
        message: '输入不是以 curl 开头，已按 cURL 参数从头解析（首个词：' + first.slice(0, 40) + '）'
      });
    }

    function pushWarn(level, message) {
      result.warnings.push({ level: level, message: message });
    }

    var idx = start;
    var endOfOptions = false;

    function nextValue(name) {
      if (idx + 1 >= tokens.length) {
        result.errors.push({ level: 'error', message: '选项 ' + name + ' 缺少对应的值' });
        return null;
      }
      idx++;
      return tokens[idx];
    }

    function applyValue(kind, name, val) {
      switch (kind) {
        case 'method': {
          if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(val)) {
            pushWarn('warn', '请求方法 "' + val + '" 含非法字符，已忽略该 -X 值');
          } else {
            if (state.explicitMethod) {
              pushWarn('warn', '检测到多个请求方法（' + state.explicitMethod + ' 与 ' + val + '），使用最后一个');
            }
            state.explicitMethod = val.toUpperCase();
          }
          break;
        }
        case 'header': {
          var colon = val.indexOf(':');
          if (colon === -1) {
            if (/;\s*$/.test(val)) {
              pushWarn('info', '已忽略移除内部请求头的写法 -H "' + val + '"（重新生成的请求不包含 curl 内部默认头）');
            } else {
              pushWarn('warn', '无法解析的 Header（缺少冒号）：' + val);
            }
            break;
          }
          var hname = val.slice(0, colon).trim();
          var hval = val.slice(colon + 1).trim();
          if (!hname) {
            pushWarn('warn', '无法解析的 Header（名称为空）：' + val);
            break;
          }
          if (hval === ';') {
            pushWarn('info', '已忽略移除内部请求头的写法 -H "' + hname + ';（重新生成的请求不包含 curl 内部默认头）');
            break;
          }
          state.headers.push({ name: hname, value: hval });
          break;
        }
        case 'cookie': {
          if (val.charAt(0) === '@') {
            pushWarn('warn', '不支持从 Cookie 文件读取（' + val + '），生成结果中将缺少这些 Cookie');
            break;
          }
          var pairs = parseCookiePairs(val);
          for (var ci = 0; ci < pairs.length; ci++) {
            if (pairs[ci].malformed) {
              pushWarn('warn', 'Cookie 片段缺少 "="：' + pairs[ci].name);
            } else {
              state.cookies.push(pairs[ci]);
            }
          }
          break;
        }
        case 'data':
        case 'dataRaw':
        case 'dataBinary': {
          if (kind !== 'dataRaw' && val.charAt(0) === '@') {
            state.blocked = true;
            result.errors.push({
              level: 'error',
              message: '无法读取本地文件内容（' + val + '），请求体无法完整解析，已阻止代码生成'
            });
            break;
          }
          state.dataParts.push({ kind: kind, value: val });
          break;
        }
        case 'dataUrlencode': {
          if (val.charAt(0) === '@') {
            state.blocked = true;
            result.errors.push({
              level: 'error',
              message: '不支持从文件读取 --data-urlencode（' + val + '），请求体无法完整解析，已阻止代码生成'
            });
            break;
          }
          state.dataParts.push({ kind: 'enc', value: val });
          break;
        }
        case 'json': {
          state.dataParts.push({ kind: 'data', value: val });
          var ct = ensureHeader(state.headers, 'Content-Type', 'application/json');
          if (ct === 'conflict') pushWarn('warn', '--json 默认设置 Content-Type: application/json，但输入中已显式指定，以显式值为准');
          var ac = ensureHeader(state.headers, 'Accept', 'application/json');
          if (ac === 'conflict') pushWarn('warn', '--json 默认设置 Accept: application/json，但输入中已显式指定，以显式值为准');
          break;
        }
        case 'form': {
          state.blocked = true;
          result.errors.push({
            level: 'error',
            message: '包含不支持的表单上传选项 ' + name + '（multipart 表单无法可靠生成），已阻止代码生成'
          });
          break;
        }
        case 'userAgent': {
          var ua = ensureHeader(state.headers, 'User-Agent', val);
          if (ua === 'conflict') pushWarn('warn', '同时存在 -A 与 User-Agent 头，已以显式 Header 为准');
          break;
        }
        case 'referer': {
          var rf = ensureHeader(state.headers, 'Referer', val);
          if (rf === 'conflict') pushWarn('warn', '同时存在 -e 与 Referer 头，已以显式 Header 为准');
          break;
        }
        case 'user': {
          var ui = val.indexOf(':');
          var username = ui === -1 ? val : val.slice(0, ui);
          var password = ui === -1 ? null : val.slice(ui + 1);
          if (password === null) {
            pushWarn('warn', '-u 只提供了用户名未提供密码，已按空密码生成 Basic 认证');
          }
          var token = base64Encode(username + ':' + (password === null ? '' : password));
          var au = ensureHeader(state.headers, 'Authorization', 'Basic ' + token);
          if (au === 'conflict') pushWarn('warn', '输入中已存在 Authorization 头，-u 已被忽略');
          else pushWarn('info', '已将 -u 用户名密码转换为 Authorization: Basic 认证头');
          break;
        }
        case 'url': {
          state.urlCandidates.push(val);
          break;
        }
        case 'ignoreValue': {
          if (!state.ignored[name]) {
            state.ignored[name] = true;
            pushWarn('info', '已忽略命令行行为选项 ' + name + '（值: ' + val + '），目标语言由各自机制处理');
          }
          break;
        }
        case 'unsupportedValue': {
          pushWarn('warn', '不支持的选项 ' + name + '（值: ' + val + '），生成的代码不包含该设置');
          break;
        }
        case 'stdin': {
          state.blocked = true;
          result.errors.push({ level: 'error', message: '不支持从标准输入读取请求体（-），已阻止代码生成' });
          break;
        }
        default:
          break;
      }
    }

    function applyFlag(action, name) {
      switch (action) {
        case 'get': state.getFlag = true; break;
        case 'head': state.headFlag = true; break;
        case 'insecure': state.insecure = true; break;
        case 'location': state.location = true; break;
        case 'compressed': state.compressed = true; break;
        default: break;
      }
    }

    while (idx < tokens.length) {
      var tok = tokens[idx];

      if (endOfOptions) {
        state.urlCandidates.push(tok);
        idx++;
        continue;
      }

      if (tok === '--') {
        endOfOptions = true;
        idx++;
        continue;
      }

      if (tok === '-') {
        applyValue('stdin', '-', '');
        idx++;
        continue;
      }

      if (tok.slice(0, 2) === '--') {
        var name = tok;
        var inlineVal = null;
        var eqi = tok.indexOf('=');
        if (eqi !== -1) {
          name = tok.slice(0, eqi);
          inlineVal = tok.slice(eqi + 1);
        }
        var kind = VALUE_OPTIONS[name];
        if (kind) {
          var val;
          if (inlineVal !== null) {
            val = inlineVal;
          } else {
            val = nextValue(name);
            if (val === null) { idx++; break; }
          }
          applyValue(kind, name, val);
        } else if (FLAG_OPTIONS[name]) {
          if (inlineVal !== null) pushWarn('warn', '选项 ' + name + ' 不接受值，已忽略 "=' + inlineVal + '"');
          applyFlag(FLAG_OPTIONS[name], name);
        } else if (IGNORE_FLAGS[name]) {
          if (!state.ignored[name]) {
            state.ignored[name] = true;
            pushWarn('info', '已忽略与命令行输出相关的选项 ' + name);
          }
        } else {
          pushWarn('warn', '不支持的选项 ' + name + (inlineVal !== null ? '（值: ' + inlineVal + '）' : '') + '，未做转换');
        }
        idx++;
        continue;
      }

      if (tok.length > 1 && tok.charAt(0) === '-') {
        var pos = 1;
        while (pos < tok.length) {
          var ch = tok.charAt(pos);
          var shortKey = '-' + ch;
          var shortKind = VALUE_OPTIONS[shortKey];
          if (shortKind) {
            var rest = tok.slice(pos + 1);
            if (rest.charAt(0) === '=') rest = rest.slice(1);
            var sval;
            if (rest.length) {
              sval = rest;
            } else {
              sval = nextValue(shortKey);
              if (sval === null) break;
            }
            applyValue(shortKind, shortKey, sval);
            break;
          } else if (FLAG_OPTIONS[shortKey]) {
            applyFlag(FLAG_OPTIONS[shortKey], shortKey);
            pos++;
          } else if (IGNORE_FLAGS[shortKey]) {
            if (!state.ignored[shortKey]) {
              state.ignored[shortKey] = true;
              pushWarn('info', '已忽略与命令行输出相关的选项 ' + shortKey);
            }
            pos++;
          } else {
            pushWarn('warn', '不支持的选项 ' + shortKey + '，未做转换');
            pos++;
          }
        }
        idx++;
        continue;
      }

      state.urlCandidates.push(tok);
      idx++;
    }

    if (result.errors.length) {
      result.blocked = state.blocked;
      return result;
    }

    if (state.urlCandidates.length === 0) {
      result.errors.push({ level: 'error', message: '未找到请求 URL（既没有位置参数也没有 --url）' });
      return result;
    }
    if (state.urlCandidates.length > 1) {
      pushWarn('warn', '检测到多个 URL，已使用最后一个：' + state.urlCandidates[state.urlCandidates.length - 1]);
    }
    var url = state.urlCandidates[state.urlCandidates.length - 1];

    var dataStr = '';
    var encError = null;
    var hasEnc = false;
    var hasNonEnc = false;
    for (var di = 0; di < state.dataParts.length; di++) {
      var part = state.dataParts[di];
      if (part.kind === 'enc') {
        hasEnc = true;
        var enc = encodeDataUrlencode(part.value);
        if (enc.error) {
          encError = enc.error;
          continue;
        }
        dataStr += (dataStr ? '&' : '') + enc.text;
      } else {
        hasNonEnc = true;
        dataStr += (dataStr ? '&' : '') + part.value;
      }
    }
    if (encError) {
      state.blocked = true;
      result.errors.push({
        level: 'error',
        message: '不支持从文件读取 --data-urlencode（@' + encError.slice(1) + '），请求体无法完整解析，已阻止代码生成'
      });
    }

    if (state.getFlag && dataStr) {
      var joiner = /[?&]$/.test(url) ? '' : (url.indexOf('?') === -1 ? '?' : '&');
      url = url + joiner + dataStr;
      dataStr = '';
      pushWarn('info', '-G/--get 已将请求体数据附加到 URL 查询参数中');
    }

    var parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!parsedUrl.protocol || parsedUrl.protocol.indexOf(':') === -1) throw new Error('no protocol');
    } catch (e) {
      result.errors.push({ level: 'error', message: 'URL 无效或缺少协议（如 https://）：' + url.slice(0, 120) });
      return result;
    }

    var body = dataStr ? dataStr : null;
    var method;
    if (state.explicitMethod) {
      method = state.explicitMethod;
    } else if (state.headFlag) {
      method = 'HEAD';
    } else if (state.getFlag) {
      method = 'GET';
    } else if (body) {
      method = 'POST';
    } else {
      method = 'GET';
    }

    var headers = state.headers.slice();
    var cookies = state.cookies.slice();
    var cookieHeaderNames = [];
    var keptHeaders = [];
    for (var hi = 0; hi < headers.length; hi++) {
      var h = headers[hi];
      if (h.name.toLowerCase() === 'cookie') {
        cookieHeaderNames.push(h.name);
        var fromHeader = parseCookiePairs(h.value);
        for (var cci = 0; cci < fromHeader.length; cci++) {
          if (!fromHeader[cci].malformed) cookies.push(fromHeader[cci]);
        }
      } else {
        keptHeaders.push(h);
      }
    }
    if (cookieHeaderNames.length) {
      pushWarn('info', '已将 Cookie 请求头合并到 Cookie 区域展示');
    }

    if (body && !findHeader(keptHeaders, 'Content-Type')) {
      keptHeaders.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
      pushWarn('info', '原命令未显式指定 Content-Type；curl 会为请求体默认添加 application/x-www-form-urlencoded，已补充以保持传输行为一致');
    }

    var contentType = null;
    var ctHeader = findHeader(keptHeaders, 'Content-Type');
    if (ctHeader) contentType = ctHeader.value;

    var query = parseQuery(parsedUrl.search);

    var dataKind = null;
    if (state.dataParts.length) {
      if (hasEnc && !hasNonEnc) dataKind = 'urlencode';
      else if (state.dataParts.some(function (p) { return p.kind === 'dataBinary'; })) dataKind = 'binary';
      else if (hasEnc) dataKind = 'mixed';
      else dataKind = 'data';
    }

    result.ok = true;
    result.blocked = state.blocked;
    result.request = {
      method: method,
      url: url,
      originalUrl: parsedUrl.href,
      query: query,
      headers: keptHeaders,
      cookies: cookies,
      body: body,
      contentType: contentType
    };
    result.meta = {
      insecure: state.insecure,
      location: state.location,
      compressed: state.compressed,
      explicitMethod: !!state.explicitMethod,
      getFlag: state.getFlag,
      dataKind: dataKind,
      dataParts: state.dataParts.slice()
    };

    if (result.blocked) {
      result.ok = false;
    }
    return result;
  }

  function escapeJsString(s) {
    var hasSq = s.indexOf("'") !== -1;
    var hasDq = s.indexOf('"') !== -1;
    var q = (hasDq && !hasSq) ? "'" : '"';
    var out = q;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '\\') out += '\\\\';
      else if (c === q) out += '\\' + q;
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32 || code === 127) {
        out += '\\x' + code.toString(16).padStart(2, '0');
      } else out += c;
    }
    return out + q;
  }

  function pyQuoteOneLine(s) {
    var hasSq = s.indexOf("'") !== -1;
    var hasDq = s.indexOf('"') !== -1;
    var q = (hasDq && !hasSq) ? "'" : '"';
    var out = q;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '\\') out += '\\\\';
      else if (c === q) out += '\\' + q;
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32 || code === 127) {
        out += '\\x' + code.toString(16).padStart(2, '0');
      } else out += c;
    }
    return out + q;
  }

  function pyStringLiteral(s) {
    var canTriple = s.indexOf("'''") === -1 &&
      s.indexOf('\r') === -1 &&
      s.charAt(s.length - 1) !== "'" &&
      s.charAt(s.length - 1) !== '\\';
    if (s.indexOf('\n') !== -1 && canTriple) {
      return "'''" + s + "'''";
    }
    return pyQuoteOneLine(s);
  }

  function pySingleLiteral(s) {
    return pyQuoteOneLine(s);
  }

  function toPyLiteral(value, level, strFn) {
    if (!strFn) strFn = pyQuoteOneLine;
    if (value === null) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return strFn(value);
    var indent = repeat('    ', level + 1);
    var closeIndent = repeat('    ', level);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      var items = value.map(function (v) { return indent + toPyLiteral(v, level + 1, strFn); });
      return '[\n' + items.join(',\n') + '\n' + closeIndent + ']';
    }
    var keys = Object.keys(value);
    if (!keys.length) return '{}';
    var rows = keys.map(function (k) {
      return indent + strFn(k) + ': ' + toPyLiteral(value[k], level + 1, strFn);
    });
    return '{\n' + rows.join(',\n') + '\n' + closeIndent + '}';
  }

  function repeat(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  function mergeDuplicateHeaders(headers, warnings, langName) {
    var map = [];
    var order = [];
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      var lower = h.name.toLowerCase();
      var found = null;
      for (var j = 0; j < map.length; j++) {
        if (map[j].lower === lower) { found = map[j]; break; }
      }
      if (found) {
        if (found.value.indexOf(h.value) === -1) {
          found.value += ', ' + h.value;
        }
      } else {
        found = { lower: lower, name: h.name, value: h.value };
        map.push(found);
        order.push(found);
      }
    }
    var lowered = {};
    for (var k = 0; k < headers.length; k++) {
      lowered[headers[k].name.toLowerCase()] = true;
    }
    if (map.length < headers.length) {
      warnings.push({
        level: 'info',
        message: '存在重复的 ' + langName + ' 请求头，已合并为逗号分隔的值'
      });
    }
    return order.map(function (e) { return { name: e.name, value: e.value }; });
  }

  var FORBIDDEN_BROWSER_HEADERS = [
    'accept-charset', 'accept-encoding', 'access-control-request-headers',
    'access-control-request-method', 'connection', 'content-length',
    'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive',
    'origin', 'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via'
  ];

  function isForbiddenBrowserHeader(name) {
    return FORBIDDEN_BROWSER_HEADERS.indexOf(name.toLowerCase()) !== -1;
  }

  function commonWarnings(parsed, lang) {
    var w = [];
    if (parsed.meta.insecure) {
      if (lang === 'python') {
        w.push({ level: 'warn', message: '原 -k/--insecure 已转换为 verify=False（关闭 TLS 证书校验），请谨慎使用' });
      } else if (lang === 'fetch') {
        w.push({ level: 'warn', message: '原 -k/--insecure 无法在浏览器 fetch 中表达：TLS 证书校验不可关闭' });
      } else {
        w.push({ level: 'info', message: '已保留 -k/--insecure 选项' });
      }
    }
    if (parsed.meta.location) {
      if (lang === 'curl') {
        w.push({ level: 'info', message: '已保留 -L/--location（跟随重定向）' });
      } else {
        w.push({ level: 'info', message: '原 -L/--location：' + (lang === 'python' ? 'requests' : 'fetch') + ' 默认跟随重定向，无需额外代码' });
      }
    } else if (lang !== 'curl') {
      w.push({ level: 'info', message: (lang === 'python' ? 'requests' : 'fetch') + ' 默认会跟随重定向；原请求未指定 -L，如需禁止请参考文档' });
    }
    if (parsed.meta.compressed) {
      if (lang === 'curl') {
        w.push({ level: 'info', message: '已保留 --compressed 选项' });
      } else {
        w.push({ level: 'info', message: '原 --compressed：' + (lang === 'python' ? 'requests/urllib3' : '浏览器') + ' 自动处理 Content-Encoding，无需额外代码' });
      }
    }
    return w;
  }

  function pyRequestBody(request) {
    var body = request.body;
    if (body === null) return null;
    var ct = (request.contentType || '').toLowerCase();
    if (ct.indexOf('application/json') !== -1) {
      try {
        var parsedJson = JSON.parse(body);
        return { key: 'json', value: toPyLiteral(parsedJson, 0) };
      } catch (e) {
        return { key: 'data', value: pyStringLiteral(body), note: true };
      }
    }
    return { key: 'data', value: pyStringLiteral(body) };
  }

  function generatePython(parsed) {
    var warnings = commonWarnings(parsed, 'python');
    if (!parsed.request || !parsed.ok) {
      return { ok: false, code: '', warnings: warnings, error: parsed.errors[0] ? parsed.errors[0].message : '解析未成功，无法生成代码' };
    }
    var r = parsed.request;
    var lines = ['import requests', ''];

    lines.push('url = ' + pyStringLiteral(r.url));
    lines.push('');

    var headers = mergeDuplicateHeaders(r.headers, warnings, 'Python');
    if (headers.length) {
      lines.push('headers = {');
      for (var i = 0; i < headers.length; i++) {
        lines.push('    ' + pyStringLiteral(headers[i].name) + ': ' + pyStringLiteral(headers[i].value) + ',');
      }
      lines.push('}');
      lines.push('');
    }

    if (r.cookies.length) {
      lines.push('cookies = {');
      for (var c = 0; c < r.cookies.length; c++) {
        lines.push('    ' + pyStringLiteral(r.cookies[c].name) + ': ' + pyStringLiteral(r.cookies[c].value) + ',');
      }
      lines.push('}');
      lines.push('');
    }

    var bodySpec = pyRequestBody(r);
    if (bodySpec) {
      if (bodySpec.note) {
        warnings.push({ level: 'warn', message: 'Content-Type 声明为 JSON 但请求体不是合法 JSON，已按原文作为 data 发送' });
      }
      lines.push((bodySpec.key === 'json' ? 'json' : 'data') + ' = ' + bodySpec.value);
      lines.push('');
    }

    var args = ['    ' + pyStringLiteral(r.method) + ',', '    url,'];
    if (headers.length) args.push('    headers=headers,');
    if (r.cookies.length) args.push('    cookies=cookies,');
    if (bodySpec) args.push('    ' + bodySpec.key + '=' + bodySpec.key + ',');
    if (parsed.meta.insecure) args.push('    verify=False,');

    lines.push('response = requests.request(');
    lines = lines.concat(args);
    lines.push(')');
    lines.push('');
    lines.push('print(response.status_code)');
    lines.push('print(response.text)');

    return { ok: true, code: lines.join('\n'), warnings: warnings };
  }

  function generateFetch(parsed) {
    var warnings = commonWarnings(parsed, 'fetch');
    if (!parsed.request || !parsed.ok) {
      return { ok: false, code: '', warnings: warnings, error: parsed.errors[0] ? parsed.errors[0].message : '解析未成功，无法生成代码' };
    }
    var r = parsed.request;

    var headers = [];
    var forbidden = [];
    for (var i = 0; i < r.headers.length; i++) {
      if (isForbiddenBrowserHeader(r.headers[i].name)) {
        forbidden.push(r.headers[i].name.toLowerCase());
      } else {
        headers.push(r.headers[i]);
      }
    }
    headers = mergeDuplicateHeaders(headers, warnings, 'fetch');

    if (forbidden.length) {
      warnings.push({
        level: 'warn',
        message: '浏览器禁止通过 fetch 设置以下请求头，已从代码中移除并保留为注释：' + forbidden.join(', ')
      });
    }
    if (r.cookies.length) {
      warnings.push({
        level: 'warn',
        message: '浏览器禁止手动设置 Cookie 头：Cookie 已改为注释。如需携带 Cookie，请在请求头中保留原值（仅限非浏览器环境）或使用 credentials: "include" 由服务端下发'
      });
    }

    var lines = [];
    lines.push('const response = await fetch(' + escapeJsString(r.url) + ', {');

    var needOptions = r.method !== 'GET' || headers.length || r.body !== null || r.cookies.length || forbidden.length;
    if (!needOptions) {
      lines[0] = 'const response = await fetch(' + escapeJsString(r.url) + ');';
      lines.push('');
      lines.push('console.log(response.status);');
      lines.push('console.log(await response.text());');
      return { ok: true, code: lines.join('\n'), warnings: warnings };
    }

    if (r.method !== 'GET') {
      lines.push('  method: ' + escapeJsString(r.method) + ',');
    }

    if (headers.length) {
      lines.push('  headers: {');
      for (var h = 0; h < headers.length; h++) {
        lines.push('    ' + escapeJsString(headers[h].name) + ': ' + escapeJsString(headers[h].value) + ',');
      }
      lines.push('  },');
    } else if (forbidden.length) {
      lines.push('  headers: {},');
    }

    for (var f = 0; f < forbidden.length; f++) {
      var orig = null;
      for (var oi = 0; oi < r.headers.length; oi++) {
        if (r.headers[oi].name.toLowerCase() === forbidden[f]) { orig = r.headers[oi]; break; }
      }
      lines.push('  // ' + (orig ? orig.name : forbidden[f]) + ': ' + escapeJsString(orig ? orig.value : '') + ' （浏览器禁止设置该头）');
    }

    if (r.cookies.length) {
      var cookieStr = r.cookies.map(function (c) { return c.name + '=' + c.value; }).join('; ');
      lines.push('  // Cookie: ' + escapeJsString(cookieStr) + ' （浏览器禁止手动设置 Cookie 头）');
    }

    if (r.body !== null) {
      lines.push('  body: ' + escapeJsString(r.body) + ',');
    }

    lines.push('});');
    lines.push('');
    lines.push('console.log(response.status);');
    lines.push('console.log(await response.text());');

    return { ok: true, code: lines.join('\n'), warnings: warnings };
  }

  function shq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function generateCurl(parsed) {
    var warnings = commonWarnings(parsed, 'curl');
    if (!parsed.request || !parsed.ok) {
      return { ok: false, code: '', warnings: warnings, error: parsed.errors[0] ? parsed.errors[0].message : '解析未成功，无法生成代码' };
    }
    var r = parsed.request;
    var meta = parsed.meta;
    var segs = ['curl'];

    segs.push(shq(r.url));

    if (r.method !== 'GET') {
      segs.push('-X ' + r.method);
    }

    for (var i = 0; i < r.headers.length; i++) {
      segs.push('-H ' + shq(r.headers[i].name + ': ' + r.headers[i].value));
    }

    if (r.cookies.length) {
      var cookieStr = r.cookies.map(function (c) { return c.name + '=' + c.value; }).join('; ');
      segs.push('-b ' + shq(cookieStr));
    }

    if (r.body !== null) {
      var pureEnc = meta.dataKind === 'urlencode';
      if (pureEnc) {
        for (var p = 0; p < meta.dataParts.length; p++) {
          segs.push('--data-urlencode ' + shq(meta.dataParts[p].value));
        }
      } else if (meta.dataKind === 'binary') {
        segs.push('--data-binary ' + shq(r.body));
      } else {
        segs.push('--data-raw ' + shq(r.body));
      }
    }

    if (meta.compressed) segs.push('--compressed');
    if (meta.insecure) segs.push('-k');
    if (meta.location) segs.push('-L');

    var code;
    if (segs.length <= 2) {
      code = segs.join(' ');
    } else {
      code = segs[0] + ' \\\n  ' + segs.slice(1).join(' \\\n  ');
    }

    return { ok: true, code: code, warnings: warnings };
  }

  function generateCode(lang, parsed) {
    if (parsed.blocked) {
      return {
        ok: false,
        code: '',
        warnings: [],
        error: '请求包含无法可靠转换的选项，已阻止代码生成（详见错误提示）'
      };
    }
    var out;
    if (lang === 'python') out = generatePython(parsed);
    else if (lang === 'fetch') out = generateFetch(parsed);
    else if (lang === 'curl') out = generateCurl(parsed);
    else out = { ok: false, code: '', warnings: [], error: '未知的目标语言：' + lang };

    if (out.ok && parsed.warnings && parsed.warnings.length) {
      var parseWarns = parsed.warnings.filter(function (w) { return w.level === 'warn'; });
      out.warnings = parseWarns.concat(out.warnings);
    }
    return out;
  }

  function convertHeaders(text, format) {
    var result = { ok: false, output: '', warnings: [], errors: [], entries: [] };
    if (text === null || text === undefined || String(text).trim() === '') {
      result.errors.push({ level: 'error', message: '输入为空：请粘贴需要转换的 Header 文本（每行一个 Key: Value）' });
      return result;
    }

    var lines = String(text).split(/\r?\n/);
    var entries = [];
    var seen = {};
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      if (line.trim().charAt(0) === '#') continue;
      var colon = line.indexOf(':');
      if (colon <= 0) {
        result.warnings.push({
          level: 'warn',
          message: '第 ' + (i + 1) + ' 行不是 "Key: Value" 格式，已跳过：' + line.trim().slice(0, 60)
        });
        continue;
      }
      var key = line.slice(0, colon).trim();
      var value = line.slice(colon + 1).trim();
      if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key)) {
        result.warnings.push({
          level: 'warn',
          message: '第 ' + (i + 1) + ' 行的 Header 名称含非法字符，已跳过：' + key.slice(0, 40)
        });
        continue;
      }
      var lower = key.toLowerCase();
      if (seen[lower] === undefined) {
        seen[lower] = { key: key, values: [] };
        entries.push(seen[lower]);
      }
      seen[lower].values.push(value);
    }

    if (!entries.length) {
      result.errors.push({ level: 'error', message: '未找到有效的 Header 行，请确认格式为每行 "Key: Value"' });
      return result;
    }

    var obj = {};
    var hasDup = false;
    for (var e = 0; e < entries.length; e++) {
      if (entries[e].values.length > 1) {
        hasDup = true;
        obj[entries[e].key] = entries[e].values;
      } else {
        obj[entries[e].key] = entries[e].values[0];
      }
    }
    if (hasDup) {
      result.warnings.push({
        level: 'warn',
        message: '存在重复的 Header 名称，已聚合为数组（JSON / 列表）'
      });
    }

    var output;
    if (format === 'json') {
      output = JSON.stringify(obj, null, 2);
    } else if (format === 'js') {
      var rows = [];
      for (var je = 0; je < entries.length; je++) {
        var jv = entries[je].values.length > 1 ? entries[je].values : entries[je].values[0];
        rows.push('  ' + escapeJsString(entries[je].key) + ': ' + JSON.stringify(jv, null, 2).replace(/\n/g, '\n  ') + ',');
      }
      output = '{\n' + rows.join('\n') + '\n}';
    } else if (format === 'py') {
      var prows = [];
      for (var pe = 0; pe < entries.length; pe++) {
        var pv = entries[pe].values.length > 1 ? entries[pe].values : entries[pe].values[0];
        prows.push('    ' + pySingleLiteral(entries[pe].key) + ': ' + toPyLiteral(pv, 1, pySingleLiteral) + ',');
      }
      output = '{\n' + prows.join('\n') + '\n}';
    } else {
      result.errors.push({ level: 'error', message: '未知的输出格式：' + format });
      return result;
    }

    result.ok = true;
    result.output = output;
    result.entries = entries.map(function (en) {
      return { key: en.key, values: en.values };
    });
    return result;
  }

  var ReqCraft = {
    tokenize: tokenize,
    parseCurl: parseCurl,
    generatePython: generatePython,
    generateFetch: generateFetch,
    generateCurl: generateCurl,
    generateCode: generateCode,
    convertHeaders: convertHeaders,
    base64Encode: base64Encode
  };

  global.ReqCraft = ReqCraft;
})(typeof window !== 'undefined' ? window : globalThis);
