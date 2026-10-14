(function (global) {
  'use strict';

  function run() {
    var results = [];
    var RC = global.ReqCraft;

    function t(name, fn) {
      try {
        fn();
        results.push({ name: name, ok: true });
      } catch (e) {
        results.push({ name: name, ok: false, error: e && e.message ? e.message : String(e) });
      }
    }

    function a(cond, msg) {
      if (!cond) throw new Error(msg || 'assertion failed');
    }

    function ae(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error((msg || 'value mismatch') + ' — expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual));
      }
    }

    function hasErr(res, fragment) {
      return res.errors.some(function (e) { return e.message.indexOf(fragment) !== -1; });
    }

    function hasWarn(res, fragment) {
      return res.warnings.some(function (w) { return w.message.indexOf(fragment) !== -1; });
    }

    function genHasWarn(gen, fragment) {
      return gen.warnings.some(function (w) { return w.message.indexOf(fragment) !== -1; });
    }

    t('用例1: 只有 URL 的 GET 请求', function () {
      var r = RC.parseCurl("curl 'https://example.com/api/list'");
      a(r.ok, '应解析成功');
      a(!r.blocked, '不应被阻止');
      ae(r.request.method, 'GET');
      ae(r.request.url, 'https://example.com/api/list');
      ae(r.request.headers.length, 0);
      ae(r.request.body, null);
      ae(r.request.query.length, 0);
      var py = RC.generateCode('python', r);
      a(py.ok && py.code.indexOf('requests.request') !== -1, 'python 生成失败');
      a(py.code.indexOf('"GET"') !== -1, 'python 应包含方法 GET');
      var fj = RC.generateCode('fetch', r);
      a(fj.ok, 'fetch 生成失败');
      a(fj.code.indexOf('await fetch("https://example.com/api/list")') !== -1, 'fetch 应为无 options 形式');
      a(fj.code.indexOf('method') === -1, 'GET 不应显式输出 method');
      var cu = RC.generateCode('curl', r);
      a(cu.ok && cu.code.indexOf("curl 'https://example.com/api/list'") !== -1, 'curl 生成失败');
      a(cu.code.indexOf('-X') === -1, 'GET 不应输出 -X');
    });

    t('用例2: 带多个 Headers 的 GET 请求', function () {
      var cmd = "curl 'https://example.com/data' \\\n" +
        "  -H 'Accept: application/json' \\\n" +
        '  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0)" \\\n' +
        "  -H 'X-Request-Id: 42'";
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.method, 'GET');
      ae(r.request.headers.length, 3);
      ae(r.request.headers[0].name, 'Accept');
      ae(r.request.headers[0].value, 'application/json');
      ae(r.request.headers[1].value, 'Mozilla/5.0 (Windows NT 10.0)');
      ae(r.request.headers[2].name, 'X-Request-Id');
      a(!r.blocked, '不应被阻止');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('"X-Request-Id": "42"') !== -1, 'python 缺少自定义头');
      var fj = RC.generateCode('fetch', r);
      a(fj.code.indexOf('"Accept": "application/json"') !== -1, 'fetch 缺少头');
    });

    t('用例3: 带 JSON Body 的 POST 请求', function () {
      var body = '{"name":"req craft","tags":["a","b"],"nested":{"n":1,"ok":true,"none":null}}';
      var cmd = "curl 'https://api.example.com/v1/users' \\\n" +
        "  -X POST \\\n" +
        "  -H 'Content-Type: application/json' \\\n" +
        "  --data-raw '" + body + "'";
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.method, 'POST');
      ae(r.request.body, body, 'body 应原样保留');
      ae(r.request.contentType, 'application/json');
      var py = RC.generateCode('python', r);
      a(py.ok, 'python 生成失败');
      a(py.code.indexOf('json = {') !== -1, 'python 应使用 json= 参数');
      a(py.code.indexOf("'name': ") !== -1 || py.code.indexOf('"name": ') !== -1, 'python 缺少 name 键');
      a(py.code.indexOf('True') !== -1 && py.code.indexOf('None') !== -1, 'python 应转换 true/null');
      a(py.code.indexOf('"POST"') !== -1, 'python 缺少 POST');
      var fj = RC.generateCode('fetch', r);
      a(fj.code.indexOf('method: "POST"') !== -1, 'fetch 缺少 method');
      a(fj.code.indexOf('body: ') !== -1, 'fetch 缺少 body');
      a(fj.code.indexOf("'" + body + "'") !== -1, 'fetch body 应保留原始 JSON 文本');
      var cu = RC.generateCode('curl', r);
      a(cu.code.indexOf('-X POST') !== -1, 'curl 缺少 -X POST');
      a(cu.code.indexOf('--data-raw') !== -1, 'curl 缺少 --data-raw');
      a(cu.code.indexOf(body) !== -1, 'curl body 不应丢失');
    });

    t('用例4: 带 Cookie 和 Authorization 的请求', function () {
      var cmd = "curl 'https://example.com/account' \\\n" +
        "  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc' \\\n" +
        "  -b 'session=xyz123; role=admin' \\\n" +
        "  -H 'Cookie: theme=dark'";
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.headers.length, 1, 'Cookie 头应移入 Cookie 区域');
      ae(r.request.headers[0].name, 'Authorization');
      ae(r.request.headers[0].value, 'Bearer eyJhbGciOiJIUzI1NiJ9.abc');
      ae(r.request.cookies.length, 3);
      ae(r.request.cookies[0].name, 'session');
      ae(r.request.cookies[1].value, 'admin');
      ae(r.request.cookies[2].name, 'theme');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('cookies = {') !== -1, 'python 缺少 cookies');
      a(py.code.indexOf('"session": "xyz123"') !== -1, 'python 缺少 session cookie');
      a(py.code.indexOf('"Authorization": "Bearer eyJ') !== -1, 'python 缺少 Authorization');
      var fj = RC.generateCode('fetch', r);
      a(genHasWarn(fj, 'Cookie'), 'fetch 应给出 Cookie 警告');
      a(fj.code.indexOf('// Cookie: ') !== -1, 'fetch Cookie 应为注释');
      var cu = RC.generateCode('curl', r);
      a(cu.code.indexOf("-b 'session=xyz123; role=admin; theme=dark'") !== -1, 'curl -b 内容不完整');
    });

    t('用例5: URL 中有查询参数和特殊字符', function () {
      var url = 'https://example.com/search?q=%E4%B8%AD%E6%96%87%20test&page=1&filter=a%2Bb&sym=%26%3D%3F';
      var r = RC.parseCurl("curl '" + url + "'");
      a(r.ok, '应解析成功');
      ae(r.request.url, url, 'URL 不应被重新编码');
      ae(r.request.query.length, 4);
      ae(r.request.query[0].key, 'q');
      ae(r.request.query[0].value, '中文 test');
      ae(r.request.query[1].value, '1');
      ae(r.request.query[2].value, 'a+b');
      ae(r.request.query[3].value, '&=?');
      ae(r.request.body, null, '查询参数不应进入请求体');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf(url) !== -1, 'python 不应改变 URL 编码');
    });

    t('用例6: 单引号、双引号、空格和转义字符', function () {
      var cmd = 'curl "https://example.com/msg" ' +
        "-H \"X-Note: it's a \\\"test\\\" value\" " +
        "--data-raw '{\"text\":\"hello world\",\"path\":\"C:\\\\temp\"}'";
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.method, 'POST');
      ae(r.request.headers[0].value, 'it\'s a "test" value', '双引号转义处理错误');
      ae(r.request.body, '{"text":"hello world","path":"C:\\\\temp"}', 'JSON body 反斜杠处理错误');
      var py = RC.generateCode('python', r);
      a(py.ok, 'python 生成失败');
      var fj = RC.generateCode('fetch', r);
      a(fj.ok, 'fetch 生成失败');
      var cu = RC.generateCode('curl', r);
      a(cu.code.indexOf("'\\''") !== -1, 'curl 应正确转义单引号');
    });

    t('用例7: 带换行反斜杠的浏览器 cURL', function () {
      var cmd = "curl 'https://api.example.com/submit' \\\n" +
        "  -H 'Content-Type: application/json' \\\n" +
        "  -H 'Accept: */*' \\\n" +
        "  --data-raw '{\"a\":1}'";
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.headers.length, 2, '续行解析后应有 2 个头');
      ae(r.request.body, '{"a":1}');
      var toks = RC.tokenize(cmd);
      ae(toks.tokens.length, 8, '分词数量错误');
      a(!toks.errors.length, '不应有分词错误');
    });

    t('用例8: 显式 -X 方法并带请求体', function () {
      var r = RC.parseCurl("curl 'https://example.com/api' -X PUT --data-raw '{\"id\":1}'");
      a(r.ok, '应解析成功');
      ae(r.request.method, 'PUT');
      ae(r.request.body, '{"id":1}');
      var r2 = RC.parseCurl('curl https://example.com/api -XPOST -d k=v');
      a(r2.ok, '短选项合并形式应解析成功');
      ae(r2.request.method, 'POST');
      ae(r2.request.body, 'k=v');
      var r3 = RC.parseCurl("curl 'https://example.com/x' -X DELETE");
      ae(r3.request.method, 'DELETE');
      ae(r3.request.body, null, 'DELETE 不应有 body');
      var r4 = RC.parseCurl("curl 'https://example.com/x' -I");
      ae(r4.request.method, 'HEAD');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('"PUT"') !== -1, 'python 缺少 PUT');
    });

    t('用例9a: 空输入报错', function () {
      var r = RC.parseCurl('');
      a(!r.ok, '空输入不应成功');
      a(hasErr(r, '输入为空'), '应提示输入为空');
      var r2 = RC.parseCurl('   \n  ');
      a(!r2.ok, '空白输入不应成功');
    });

    t('用例9b: URL 缺失报错', function () {
      var r = RC.parseCurl("curl -H 'Accept: */*'");
      a(!r.ok, '缺少 URL 不应成功');
      a(hasErr(r, '未找到请求 URL'), '应提示缺少 URL');
    });

    t('用例9c: 引号不匹配报错', function () {
      var r = RC.parseCurl("curl 'https://example.com' -H 'Accept: x");
      a(!r.ok, '引号不匹配不应成功');
      a(hasErr(r, '单引号未闭合'), '应提示单引号未闭合');
      var r2 = RC.parseCurl('curl "https://example.com" -H "X: y');
      a(!r2.ok, '双引号不匹配不应成功');
      a(hasErr(r2, '双引号未闭合'), '应提示双引号未闭合');
    });

    t('用例9d: 不支持的参数给出警告', function () {
      var r = RC.parseCurl("curl 'https://example.com' --proxy http://127.0.0.1:8080 --unknown-flag");
      a(r.ok, '仅警告的选项不应导致解析失败');
      a(hasWarn(r, '--proxy'), '应警告 --proxy');
      a(hasWarn(r, '--unknown-flag'), '应警告未知选项');
      var py = RC.generateCode('python', r);
      a(py.ok, 'python 仍应生成');
      a(genHasWarn(py, '--proxy'), '生成结果应带出警告');
    });

    t('用例9e: 本地文件与表单选项阻止生成', function () {
      var r = RC.parseCurl("curl 'https://example.com' -d @./data.json");
      a(r.blocked, '-d @file 应阻止生成');
      a(hasErr(r, '无法读取本地文件'), '应说明无法读取文件');
      var g = RC.generateCode('python', r);
      a(!g.ok, '被阻止时不应生成代码');
      var r2 = RC.parseCurl("curl 'https://example.com' -F 'name=value'");
      a(r2.blocked, '-F 应阻止生成');
      a(hasErr(r2, '不支持的表单上传'), '应说明表单不支持');
    });

    t('用例9f: 缺少值的选项报错', function () {
      var r = RC.parseCurl('curl https://example.com -H');
      a(!r.ok, '选项缺值应失败');
      a(hasErr(r, '缺少对应的值'), '应提示选项缺少值');
    });

    t('用例10a: Headers 转 JSON', function () {
      var text = 'Content-Type: application/json\nX-Token: abc 123\nAccept: */*';
      var out = RC.convertHeaders(text, 'json');
      a(out.ok, '转换应成功');
      var obj = JSON.parse(out.output);
      ae(obj['Content-Type'], 'application/json');
      ae(obj['X-Token'], 'abc 123');
      ae(obj['Accept'], '*/*');
    });

    t('用例10b: Headers 转 JavaScript 对象', function () {
      var text = 'Content-Type: application/json\r\nX-Token: abc';
      var out = RC.convertHeaders(text, 'js');
      a(out.ok, '转换应成功');
      a(out.output.indexOf('"Content-Type": "application/json",') !== -1, 'js 输出缺少键值');
      a(out.output.indexOf('"X-Token": "abc",') !== -1, 'js 输出缺少第二个键值');
      a(out.output.trim().charAt(0) === '{', 'js 输出应以 { 开头');
      a(out.output.trim().charAt(out.output.trim().length - 1) === '}', 'js 输出应以 } 结尾');
    });

    t('用例10c: Headers 转 Python 字典', function () {
      var text = "Content-Type: application/json\nX-Quote: it's fine\nX-Empty:";
      var out = RC.convertHeaders(text, 'py');
      a(out.ok, '转换应成功');
      a(out.output.indexOf('"Content-Type": "application/json",') !== -1, 'py 输出缺少键值');
      a(out.output.indexOf('"it\'s fine"') !== -1, 'py 值含单引号时应用双引号包裹避免转义');
      a(out.output.indexOf('"X-Empty": ""') !== -1, 'py 应保留空值');
    });

    t('用例10d: 重复 Header 聚合与坏行警告', function () {
      var text = 'Accept: a\nAccept: b\nbad line without colon\nAccept: c';
      var out = RC.convertHeaders(text, 'json');
      a(out.ok, '转换应成功');
      var obj = JSON.parse(out.output);
      a(Array.isArray(obj.Accept), '重复键应为数组');
      ae(obj.Accept.length, 3);
      a(out.warnings.some(function (w) { return w.message.indexOf('第 3 行') !== -1; }), '应警告第 3 行');
      a(out.warnings.some(function (w) { return w.message.indexOf('重复') !== -1; }), '应警告重复键');
      var empty = RC.convertHeaders('just a sentence', 'json');
      a(!empty.ok && empty.errors.length, '无有效行应报错');
    });

    t('用例11: -G 将请求体移入查询参数', function () {
      var r = RC.parseCurl("curl 'https://example.com/s' -G -d 'page=2' -d 'q=hello world'");
      a(r.ok, '应解析成功');
      ae(r.request.method, 'GET');
      ae(r.request.body, null, 'GET 不应有 body');
      a(r.request.url.indexOf('page=2') !== -1 && r.request.url.indexOf('q=hello') !== -1, '数据应附加到 URL');
      a(r.request.query.some(function (q) { return q.key === 'q' && q.value === 'hello world'; }), '查询参数应可解码');
    });

    t('用例12: --data-urlencode 编码', function () {
      var r = RC.parseCurl("curl 'https://example.com/s' -G --data-urlencode 'q=中文 & symbols'");
      a(r.ok, '应解析成功');
      a(r.request.url.indexOf('q=%E4%B8%AD%E6%96%87%20%26%20symbols') !== -1, 'URL 编码错误: ' + r.request.url);
      var r2 = RC.parseCurl("curl 'https://example.com/s' --data-urlencode 'name=hello world' -d 'x=1'");
      a(r2.ok, '混合形式应解析成功');
      ae(r2.request.body, 'name=hello%20world&x=1');
    });

    t('用例13: -u 生成 Basic 认证', function () {
      var r = RC.parseCurl("curl 'https://example.com' -u admin:p@ss");
      a(r.ok, '应解析成功');
      var auth = r.request.headers.filter(function (h) { return h.name === 'Authorization'; })[0];
      a(auth, '应生成 Authorization 头');
      ae(auth.value, 'Basic ' + RC.base64Encode('admin:p@ss'));
      var r2 = RC.parseCurl("curl 'https://example.com' -u admin");
      a(r2.warnings.some(function (w) { return w.message.indexOf('未提供密码') !== -1; }), '缺密码应警告');
    });

    t('用例14: 无 -X 时依据请求体判断方法', function () {
      var r = RC.parseCurl("curl 'https://example.com' -d 'a=1'");
      ae(r.request.method, 'POST', '有 body 应推断 POST');
      var r2 = RC.parseCurl("curl 'https://example.com'");
      ae(r2.request.method, 'GET', '无 body 应为 GET');
      var r3 = RC.parseCurl("curl 'https://example.com' -X PATCH -d 'a=1'");
      ae(r3.request.method, 'PATCH', '显式方法优先');
    });

    t('用例15: 多个 -d 用 & 连接且查询参数不入 body', function () {
      var r = RC.parseCurl("curl 'https://example.com/p?x=1' -d 'a=1' -d 'b=2'");
      ae(r.request.body, 'a=1&b=2');
      ae(r.request.query.length, 1);
      ae(r.request.query[0].key, 'x');
      var r2 = RC.parseCurl('curl "https://example.com/p?x=1&y=2"');
      ae(r2.request.body, null, 'URL 查询参数不应进入 body');
      ae(r2.request.query.length, 2);
    });

    t('用例16: Windows cmd 的 ^ 转义格式', function () {
      var cmd = 'curl ^"https://api.example.com/v1^" -H ^"Content-Type: application/json^" --data-raw ^"^{^\\^"a^\\":1}^"';
      var r = RC.parseCurl(cmd);
      a(r.ok, 'caret 格式应解析成功: ' + JSON.stringify(r.errors));
      ae(r.request.url, 'https://api.example.com/v1');
      ae(r.request.headers[0].name, 'Content-Type');
      ae(r.request.headers[0].value, 'application/json');
      ae(r.request.body, '{"a":1}');
      var multiline = 'curl ^"https://example.com/api^" ^\n' +
        '  -H ^"accept: */*^" ^\n' +
        '  --data-raw ^"{^\\^"x^\\":2}^"';
      var r2 = RC.parseCurl(multiline);
      a(r2.ok, 'caret 多行格式应解析成功: ' + JSON.stringify(r2.errors));
      a(r2.request.headers.some(function (h) { return h.name === 'Content-Type' && h.value === 'application/x-www-form-urlencoded'; }), '应补充 curl 默认 Content-Type');
      ae(r2.request.body, '{"x":2}');
      var amp = 'curl ^"https://example.com^" --data ^"a=b^&c=d^"';
      var r3 = RC.parseCurl(amp);
      a(r3.ok, 'caret ^& 应解析成功: ' + JSON.stringify(r3.errors));
      ae(r3.request.body, 'a=b&c=d');
    });

    t('用例17: 重复 Header 合并与生成一致性', function () {
      var r = RC.parseCurl("curl 'https://example.com' -H 'Accept: a' -H 'Accept: b'");
      a(r.ok, '应解析成功');
      ae(r.request.headers.length, 2, '解析阶段应保留重复头');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('"Accept": "a, b"') !== -1, 'python 应合并重复头');
      var fj = RC.generateCode('fetch', r);
      a(fj.code.indexOf('"Accept": "a, b"') !== -1, 'fetch 应合并重复头');
    });

    t('用例18: --json 选项自动补充请求头', function () {
      var r = RC.parseCurl('curl https://example.com --json \'{"k":1}\'');
      a(r.ok, '应解析成功');
      ae(r.request.method, 'POST');
      ae(r.request.contentType, 'application/json');
      ae(r.request.body, '{"k":1}');
      var acc = r.request.headers.filter(function (h) { return h.name === 'Accept'; })[0];
      a(acc && acc.value === 'application/json', '应自动补 Accept');
    });

    t('用例19: curl 格式化输出可再次解析（往返一致）', function () {
      var body = '{"msg":"fine \\"quoted\\" text","n":2}';
      var r = RC.parseCurl("curl 'https://example.com/api?x=1' -X POST -H 'Content-Type: application/json' -b 'a=b' --data-raw '" + body + "'");
      a(r.ok, '原始解析失败');
      var cu = RC.generateCode('curl', r);
      a(cu.ok, 'curl 生成失败');
      var r2 = RC.parseCurl(cu.code);
      a(r2.ok, '二次解析失败: ' + JSON.stringify(r2.errors));
      ae(r2.request.url, r.request.url, '往返 URL 不一致');
      ae(r2.request.method, r.request.method, '往返方法不一致');
      ae(r2.request.body, r.request.body, '往返 body 不一致');
      ae(r2.request.headers.length, r.request.headers.length, '往返头数量不一致');
      ae(r2.request.cookies.length, r.request.cookies.length, '往返 cookie 数量不一致');
    });

    t('用例20: -k / -L / --compressed 标记与生成', function () {
      var r = RC.parseCurl("curl 'https://example.com' -k -L --compressed");
      a(r.ok, '应解析成功');
      a(r.meta.insecure && r.meta.location && r.meta.compressed, 'flags 应被记录');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('verify=False') !== -1, 'python 应包含 verify=False');
      a(genHasWarn(py, 'verify=False'), 'python 应警告 verify=False');
      var fj = RC.generateCode('fetch', r);
      a(genHasWarn(fj, '无法在浏览器 fetch 中表达'), 'fetch 应警告 -k');
      var cu = RC.generateCode('curl', r);
      a(cu.code.indexOf('-k') !== -1 && cu.code.indexOf('-L') !== -1 && cu.code.indexOf('--compressed') !== -1, 'curl 应保留全部选项');
    });

    t('用例21: fetch 对受限头的处理', function () {
      var r = RC.parseCurl("curl 'https://example.com' -H 'Referer: https://site.example/' -H 'Host: api.example.com'");
      a(r.ok, '应解析成功');
      var fj = RC.generateCode('fetch', r);
      a(genHasWarn(fj, '浏览器禁止'), '应给出禁止头警告');
      a(fj.code.indexOf('// Referer:') !== -1, '受限头应注释保留');
      a(fj.code.indexOf('  Referer: ') === -1, '受限头不应出现在 headers 中');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('"Referer": "https://site.example/"') !== -1, 'python 不应丢弃 Referer');
    });

    t('用例22: tokenize 引号与转义细节', function () {
      var out = RC.tokenize("curl 'a b' \"c d\" e\\ f");
      a(!out.errors.length, '不应有错误');
      ae(out.tokens.length, 4);
      ae(out.tokens[1], 'a b');
      ae(out.tokens[2], 'c d');
      ae(out.tokens[3], 'e f');
      var out2 = RC.tokenize('curl "line1\nline2"');
      a(!out2.errors.length, '双引号内换行应保留');
      ae(out2.tokens[1], 'line1\nline2');
      var out3 = RC.tokenize("curl 'unclosed");
      a(out3.errors.length === 1, '应报告未闭合');
    });

    t('用例23: 非 curl 开头的容错与多余位置参数', function () {
      var r = RC.parseCurl("'https://example.com' -H 'A: b'");
      a(r.ok, '应容错解析');
      ae(r.request.url, 'https://example.com');
      a(r.warnings.some(function (w) { return w.message.indexOf('不是以 curl 开头') !== -1; }), '应提示非 curl 开头');
      var r2 = RC.parseCurl("curl 'https://a.com' 'https://b.com'");
      a(r2.warnings.some(function (w) { return w.message.indexOf('多个 URL') !== -1; }), '多余 URL 应警告');
      ae(r2.request.url, 'https://b.com', '应使用最后一个 URL');
    });

    t('用例24: convertHeaders 空输入与非法格式', function () {
      var r = RC.convertHeaders('', 'json');
      a(!r.ok && r.errors.some(function (e) { return e.message.indexOf('输入为空') !== -1; }), '空输入应报错');
      var r2 = RC.convertHeaders('Content-Type: application/json', 'unknown');
      a(!r2.ok, '未知格式应报错');
    });

    t('用例25: 请求体不合法 JSON 时 python 回退为 data', function () {
      var r = RC.parseCurl("curl 'https://example.com' -H 'Content-Type: application/json' --data-raw '{not json}'");
      a(r.ok, '应解析成功');
      ae(r.request.body, '{not json}');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('data = ') !== -1, '应回退为 data');
      a(genHasWarn(py, '不是合法 JSON'), '应回退警告');
    });

    t('用例26: 含双引号的值使用单引号包裹避免多余转义', function () {
      var cmd = 'curl \'https://example.com\' -H \'sec-ch-ua-platform: "Windows"\' --data-raw \'{"a":1}\'';
      var r = RC.parseCurl(cmd);
      a(r.ok, '应解析成功');
      ae(r.request.headers[0].value, '"Windows"', '解析结果应为原始值');
      ae(r.request.body, '{"a":1}');
      var py = RC.generateCode('python', r);
      a(py.ok, 'python 生成失败');
      a(py.code.indexOf('"sec-ch-ua-platform": \'"Windows"\'') !== -1, 'python 应使用单引号包裹含双引号的值');
      a(py.code.indexOf('data = \'{"a":1}\'') !== -1, 'python data 应与原始请求体一致');
      a(py.code.indexOf('\\"') === -1, 'python 不应出现反斜杠转义的双引号');
      var fj = RC.generateCode('fetch', r);
      a(fj.ok, 'fetch 生成失败');
      a(fj.code.indexOf('"sec-ch-ua-platform": \'"Windows"\'') !== -1, 'fetch 应使用单引号包裹');
      a(fj.code.indexOf('body: \'{"a":1}\'') !== -1, 'fetch body 应与原始请求体一致');
      a(fj.code.indexOf('\\"') === -1, 'fetch 不应出现多余转义');
    });

    t('用例27: text/plain 文本请求体', function () {
      var r = RC.parseCurl("curl 'https://example.com/note' -X POST -H 'Content-Type: text/plain' --data-raw 'hello world'");
      a(r.ok, '应解析成功');
      ae(r.request.method, 'POST');
      ae(r.request.contentType, 'text/plain');
      ae(r.request.body, 'hello world');
      var py = RC.generateCode('python', r);
      a(py.code.indexOf('data = "hello world"') !== -1, 'python 应以 data= 发送原文');
      a(py.code.indexOf('json =') === -1, 'text 不应使用 json=');
      var fj = RC.generateCode('fetch', r);
      a(fj.code.indexOf('body: "hello world"') !== -1, 'fetch body 应为原文');

      var r2 = RC.parseCurl('curl \'https://example.com/say\' -H \'Content-Type: text/plain\' --data-raw \'say "hi" now\'');
      a(r2.ok, '含双引号文本应解析成功');
      ae(r2.request.body, 'say "hi" now');
      var py2 = RC.generateCode('python', r2);
      a(py2.code.indexOf('data = \'say "hi" now\'') !== -1, '含双引号文本应用单引号包裹');
      a(py2.code.indexOf('\\"') === -1, '不应出现多余转义');

      var r3 = RC.parseCurl("curl 'https://example.com/log' -H 'Content-Type: text/plain' --data-raw $'line1\\nline2'");
      a(r3.ok, 'ANSI-C 多行文本应解析成功');
      ae(r3.request.body, 'line1\nline2', '换行应被还原');
      var cu3 = RC.generateCode('curl', r3);
      var rp3 = RC.parseCurl(cu3.code);
      a(rp3.ok && rp3.request.body === r3.request.body, '多行文本 curl 往返应一致');

      var r4 = RC.parseCurl('curl \'https://example.com/x\' -H \'Content-Type: text/plain\' --data-raw \'{"a":1}\'');
      ae(r4.request.contentType, 'text/plain');
      var py4 = RC.generateCode('python', r4);
      a(py4.code.indexOf('data = \'{"a":1}\'') !== -1, '声明 text/plain 的 JSON 文本应保持 data= 原文');
      a(py4.code.indexOf('json =') === -1, '声明 text/plain 时不应用 json=');
    });

    t('用例28: 无 Content-Type 的请求体补充 curl 默认值', function () {
      var r = RC.parseCurl("curl 'https://example.com/login' -d 'username=tom' -d 'pwd=pa ss'");
      a(r.ok, '应解析成功');
      ae(r.request.body, 'username=tom&pwd=pa ss');
      var ct = r.request.headers.filter(function (h) { return h.name === 'Content-Type'; })[0];
      a(ct, '应补充 curl 默认 Content-Type');
      ae(ct.value, 'application/x-www-form-urlencoded');
      a(r.warnings.some(function (w) { return w.message.indexOf('application/x-www-form-urlencoded') !== -1; }), '应给出补充说明');
      var r2 = RC.parseCurl("curl 'https://example.com/x' -H 'Content-Type: application/json' --data-raw '{\"a\":1}'");
      var ct2 = r2.request.headers.filter(function (h) { return h.name === 'Content-Type'; });
      ae(ct2.length, 1, '显式指定时不应重复添加');
    });

    return results;
  }

  global.ReqCraftTests = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
