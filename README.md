# ReqCraft · 请求工坊

一个纯前端 HTTP 请求转换工具：把浏览器开发者工具「Copy as cURL」得到的请求，自动解析为**方法 / URL / Query / Headers / Cookies / Body**，并生成 **Python requests、JavaScript fetch、格式化 cURL** 代码。

**纯 HTML + CSS + 原生 JavaScript**。无构建步骤、无依赖、无后端、无数据库、无账号、无 API Key、无网络请求。所有转换都在浏览器本地完成。

## 目录

- [功能](#功能)
- [文件结构](#文件结构)
- [本地运行](#本地运行)
- [浏览器运行测试](#浏览器运行测试)
- [支持解析的 cURL 参数](#支持解析的-cURL-参数)
- [代码生成说明](#代码生成说明)
- [Headers 转换](#headers-转换)
- [部署到 Vercel](#部署到-vercel-等静态托管平台)
- [当前限制](#当前限制)
- [隐私处理](#隐私处理)

## 功能

1. **cURL 解析** — 从粘贴的 cURL 命令中提取请求方法、URL、Query 参数、Headers、Cookies 和请求体。
2. **代码生成** — 一键切换目标语言，生成语义一致的请求代码。
3. **请求信息展示** — 方法、URL、查询参数、Headers、Cookies、Body 分区清晰展示，Body 支持一键复制。
4. **Headers 转换** — 把「每行一个 `Key: Value`」的 Header 文本转成 JSON / JavaScript 对象 / Python 字典。
5. **错误与警告分级** — 无法解析时**阻止生成并说明原因**；不支持的选项以**黄色警告**明确列出，绝不静默丢弃、绝不假装成功。
6. **复制反馈** — 复制成功后按钮短暂变为「已复制」。

## 文件结构

| 文件 | 说明 |
|---|---|
| `index.html` | 工具主页面 |
| `style.css` | 深色开发者工具风格样式，桌面 / 手机响应式 |
| `core.js` | **核心逻辑（无 DOM）**：shell 词法解析、cURL 解析、三种语言生成器、Headers 转换器。挂载为 `window.ReqCraft` |
| `app.js` | 页面 UI 装配与状态渲染（仅在 `index.html` 中生效） |
| `tests.js` | 浏览器 / Node 双环境的测试用例（33 项断言用例） |
| `tests.html` | 浏览器测试运行页面 |

## 本地运行

没有任何依赖，双击即可：

- **直接双击 `index.html`**（或右键 → 打开方式 → 浏览器）。
- 或启动任意静态服务器（可选，便于测试）：
  ```bash
  # 任选其一：
  python -m http.server 8080        # 若本机有 Python（仅作静态服务器）
  npx serve .                       # 若本机有 Node
  ```
  然后访问 `http://localhost:8080`。

使用方式：

1. 在浏览器开发者工具 Network 面板右键请求 → **Copy** → **Copy as cURL (bash)**（Windows 也可复制 cmd 版）。
2. 粘贴到左侧输入框，点击「解析」（或粘贴后自动解析）。
3. 右侧切换语言并「复制代码」。
4. 下方独立区域可将粘贴的 `Key: Value` Header 文本转成 JSON / JS / Python。

## 浏览器运行测试

- 打开 `tests.html`，页面会立即运行 33 项用例并显示通过 / 失败清单。
- 命令行运行（Node，可选验证用）：
  ```bash
  node -e "require('./core.js'); require('./tests.js'); const r = globalThis.ReqCraftTests.run(); console.log(r.filter(x=>!x.ok).length === 0 ? '全部通过 ' + r.length : '有失败');"
  ```

## 支持解析的 cURL 参数

### 全部支持

| 参数 | 说明 |
|---|---|
| `curl <URL>` | 位置参数 URL（也支持 `--url`） |
| `-X / --request <method>` | 显式请求方法（优先级最高），支持 `-XPOST` 合并写法 |
| `-H / --header <header>` | 请求头，可重复；正确处理 `Name: value` 与空值 |
| `-b / --cookie <cookies>` | Cookie，支持 `k=v; k2=v2` 形式，并合并 `-H 'Cookie: ...'` |
| `-d / --data / --data-raw / --data-ascii / --data-binary` | 请求体，多个时按 curl 语义用 `&` 连接 |
| `--data-urlencode` | 按 curl 语义编码（`name=content` / 纯 content / `=content`） |
| `--json` | 自动补充 `Content-Type` / `Accept` 并设置请求体 |
| `-G / --get` | 将请求体数据并入 URL 查询参数 |
| `-I / --head` | 推断 HEAD 方法 |
| `-A / --user-agent` | 设置 `User-Agent` 头 |
| `-e / --referer` | 设置 `Referer` 头 |
| `-u / --user <user:pass>` | 转换为 `Authorization: Basic` 头 |
| `-k / --insecure` | 记录并转换：Python → `verify=False`；curl → 保留 `-k`；fetch → 警告无法表达 |
| `-L / --location` | 记录重定向意图；curl → 保留 `-L`；requests/fetch 默认跟随 |
| `--compressed` | 记录；requests / 浏览器自动处理 gzip，curl 保留 `--compressed` |
| `--` | 结束选项标记 |
| 引号与转义 | 单引号、双引号、`\"` `\\` 转义、`\`+换行续行、`$'...'` ANSI-C 引用（含 `\n \r \t \xHH \uHHHH`）、Windows cmd 的 `^"` / `^&` / `^` 续行转义 |

### 明确忽略并提示（不影响请求语义的命令行行为）

`-s -S -v -i -f -q --silent --verbose --show-error --fail --include --progress-bar --disable --fail-with-body` 以及 `--connect-timeout --max-time --retry --output --write-out --resolve --interface --max-filesize --speed-limit --proto --tls-max --noproxy` 等仅影响命令行表现或环境设置的选项。

### 无法转换 → 阻止生成（红色错误并说明原因）

- 本地文件解析：`-d @file`、`--data-binary @file`、`--data-urlencode @file`、`-b @file`（Cookie 文件）——需要访问本地文件系统，纯前端无法安全实现。
- 表单上传：`-F / --form / --form-string`（multipart）。
- 标准输入：`-`。

### 不支持的选项 → 黄色警告

一切未列出的选项（如 `--proxy --cert --cacert --key` 等），均会输出醒目的警告「不支持的选项 `--xxx`，未做转换」，并随生成代码再次列出，避免「看似成功实则丢失设置」。

## 代码生成说明

- **Python requests**：使用 `requests.request(METHOD, url, headers=..., cookies=..., data=..., json=..., verify=...)`。JSON 请求体在 `Content-Type: application/json` 且是合法 JSON 时安全映射为 `json=`（保留语义）；否则以 `data=` 发送**原始文本**。
- **JavaScript fetch**：标准 `fetch(url, { method, headers, body })`。浏览器禁止设置的受限头（`Cookie`、`Host`、`Referer`、`Content-Length` 等）会被注释保留，并给出醒目警告。
- **cURL**：多行格式化输出，保留方法、头、Cookie、请求体以及 `-k / -L / --compressed` 等原选项；单引号按 shell 规则正确转义（`'\''`）。
- **非 JSON 文本请求体**（`text/plain`、XML、表单等）一律以 `data=` / `body` **原文发送**，不会改写内容；即使文本恰好长得像 JSON，只要 Content-Type 不是 JSON 也保持原文。
- **默认 Content-Type 补全**：`-d/--data` 系列产生请求体但未显式指定 Content-Type 时，按 curl 的真实传输行为补充 `application/x-www-form-urlencoded` 并给出提示，保证生成代码与原命令发出完全相同的请求。
- 重复 Header 自动合并为逗号分隔值；URL 查询参数**永远不会**被误拼进请求体；显式 `-X` 方法优先于自动推断。
- 字符串按「智能引号」输出：值本身含双引号时用单引号包裹（如 `"sec-ch-ua-platform": '"Windows"'`），含单引号时用双引号包裹，杜绝多余转义。

## Headers 转换

输入每行一个 `Key: Value`，可输出：

- **JSON**（重复键聚合为数组）
- **JavaScript 对象**
- **Python 字典**（单引号、`\`、控制字符正确转义）

非 `Key: Value` 格式的行会带行号警告并跳过；完全无效时给出错误。

## 部署到 Vercel 等静态托管平台

这是一个 100% 静态网站，按「无框架静态站点」部署即可：

1. **推送到 Git 仓库**（可选但推荐）：
   ```bash
   git init
   git add .
   git commit -m "feat: ReqCraft request converter"
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
2. **在 Vercel 导入仓库**：`vercel.com` → New Project → Import 仓库 →
   - Framework Preset：**Other**（不要选任何框架）
   - Build Command：留空
   - Output Directory：留空（根目录）
   - Deploy。
3. **命令行方式**（可选）：
   ```bash
   npm i -g vercel
   vercel        # 按提示登录并部署
   vercel --prod # 发布生产
   ```
4. **其他平台**：同样按「静态站点」部署即可——`Netlify`（Build command 留空）、`GitHub Pages`（直接把仓库根目录发布为 Pages）、`Cloudflare Pages`、或任意 `nginx` / OSS 静态托管。Vercel 的示例部署配置即 `vercel.json` 空配置，无需额外文件。

部署后 `index.html`、`tests.html`、`core.js`、`app.js` 会作为静态资源原样上线，无需任何服务端环境。

## 当前限制

- **不发送请求**：本工具只负责解析与生成代码，不预览真实响应，也**绝不**向目标站点发出请求。
- **本地文件选项被阻止**：`@file` 请求体 / Cookie 文件需要文件系统访问，纯前端无法可靠完成。
- **multipart 表单（`-F`）被阻止**：无法在不引入额外逻辑的前提下保证请求体语义。
- **Cookie / 受限头在 fetch 中不可设置**：浏览器安全模型禁止手动设置 `Cookie`、`Host`、`Referer` 等，代码中以注释保留原值并警告。
- **`-k` 无法在 fetch 中表达**：浏览器无法关闭 TLS 证书校验。
- **重定向差异**：requests / fetch 默认跟随重定向，而 curl 默认不跟随，工具会对未指定 `-L` 的情况给出提示。
- **cmd 格式解析依赖 Chrome 的实际转义输出**（`^"`/`^&`/`^` 续行）。极端自定义 cmd 转义组合（如混合 bash 反斜杠转义）可能解析异常，此时会以明确错误提示，而不会静默产出错误结果。
- **URL 不重新编码**：展示与生成均保留原始 URL 文本，避免擅自改变数据语义。
- 未覆盖 `--data-urlencode file@`、`-r/-R`、`--cookie-jar`、`--form` 等边缘能力的完整实现（均会明确报错或警告）。

## 隐私处理

- **零上传**：页面不发送任何网络请求，不调用任何外部 API，输入内容只存在于当前页面内存中。
- **不持久化**：不使用 `localStorage` / `sessionStorage` / IndexedDB 写入用户输入；刷新页面即完全清空。
- **无账号、无数据库、无 API Key、无第三方脚本**。
- **刻意克制**：对可能包含密码、Token、Cookie 的内容，工具只做解析与展示，并在页面顶部常驻「所有转换均在浏览器本地完成，不上传任何数据」提示。
- 打开的 `tests.html` 同样仅在本机运行测试。