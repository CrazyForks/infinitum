# infinitum

一个基于 Next.js + SQLite 的信息流面板，支持：

- 从配置文件定义 RSS 源
- RSS 缺全文时补抓原文正文
- 基于关键词黑名单过滤
- 英文标题自动翻译为中文
- 通过 OpenAI-compatible API 生成中文摘要
- 管理员登录后触发刷新、重生成翻译与摘要
- 后台配置页管理信息源、分组、黑名单和 AI 配置（模型 API、提示词）
- 按时间范围浏览信息流
- 支持本地运行与 Docker Compose 部署

## 配置文件

首次启动时，应用会把这个文件里的配置导入数据库作为初始值：

- [infinitum.config.json](/Users/shawn/Documents/GitHub/infinitum/config/infinitum.config.json)

文件结构如下：

```json
{
  "rssSources": [
    {
      "name": "OpenAI News",
      "rssUrl": "https://openai.com/news/rss.xml",
      "siteUrl": "https://openai.com/news",
      "enabled": true,
      "fetchFullTextWhenMissing": true
    }
  ],
  "blacklistKeywords": ["layoffs", "funding"],
  "ingestion": {
    "itemConcurrency": 3
  },
  "modelApi": {
    "apiKey": "sk-xxx",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4.1-mini"
  }
}
```

字段说明：

- `rssSources`: RSS 源列表
- `blacklistKeywords`: 关键词黑名单数组
- `ingestion.itemConcurrency`: 单次抓取时的条目并发数，建议保持在 `2-5`
- `modelApi.apiKey`: 模型接口密钥
- `modelApi.baseURL`: OpenAI-compatible 接口基地址，官方接口可填 `https://api.openai.com/v1`
- `modelApi.model`: 模型名

如果 `modelApi.apiKey` 留空：

- 标题翻译会回退为原始标题
- 摘要会回退为 RSS 摘要或正文截断

可以直接编辑 [infinitum.config.json](/Users/shawn/Documents/GitHub/infinitum/config/infinitum.config.json)，也可以从 [infinitum.config.example.json](/Users/shawn/Documents/GitHub/infinitum/config/infinitum.config.example.json) 复制一份新模板再改。

导入完成后：

- 运行时抓取配置以数据库为准
- 后续请通过后台设置页修改信息源、分组、黑名单和模型 API
- 原配置文件不再作为运行时唯一来源

## 管理员环境变量

除了 `DATABASE_URL`，还需要配置：

- `ADMIN_PASSWORD`: 管理员登录密码
- `ADMIN_SESSION_SECRET`: 用于签名管理员会话 cookie 的随机密钥

登录入口：

- `http://localhost:3000/admin/login`

登录成功后：

- 首页会显示管理员概览与“立即刷新”
- 每条信息会显示“重新生成翻译 / 重新生成摘要”
- 设置页位于 `http://localhost:3000/admin/settings`

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 准备环境变量

```bash
cp .env.example .env
```

3. 按需修改配置文件

直接编辑 [infinitum.config.json](/Users/shawn/Documents/GitHub/infinitum/config/infinitum.config.json)。

4. 初始化或升级 SQLite 数据库

```bash
npm run db:setup
```

说明：

- 这个命令会在首次运行时建表
- 如果本地数据库字段落后于当前版本，也会自动补齐当前运行所需字段

5. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。

## Docker Compose 部署

1. 准备 Docker 环境变量

```bash
cp .env.docker.example .env.docker
```

2. 按需修改配置文件

直接编辑 [infinitum.config.json](/Users/shawn/Documents/GitHub/infinitum/config/infinitum.config.json)。

3. 启动服务

```bash
docker compose up -d --build
```

4. 查看日志

```bash
docker compose logs -f app
```

5. 停止服务

```bash
docker compose down
```

说明：

- SQLite 数据库存放在容器内的 `/app/data/dev.db`
- `docker-compose.yml` 通过命名卷 `infinitum-data` 持久化数据库
- `docker-compose.yml` 会把宿主机的 `./config` 目录只读挂载到容器 `/app/config`
- 容器启动时会自动执行数据库初始化，不需要额外手工建表

## RSS 配置示例

```json
{
  "rssSources": [
    {
      "name": "OpenAI News",
      "rssUrl": "https://openai.com/news/rss.xml",
      "siteUrl": "https://openai.com/news",
      "enabled": true,
      "fetchFullTextWhenMissing": true
    },
    {
      "name": "Hacker News Frontpage",
      "rssUrl": "https://hnrss.org/frontpage",
      "siteUrl": "https://news.ycombinator.com/",
      "enabled": true,
      "fetchFullTextWhenMissing": false
    }
  ],
  "blacklistKeywords": [],
  "ingestion": {
    "itemConcurrency": 3
  },
  "modelApi": {
    "apiKey": "",
    "baseURL": "",
    "model": "gpt-4.1-mini"
  }
}
```

## 常用命令

```bash
npm run dev
npm run lint
npm test
npm run build
npm run db:setup
docker compose up -d --build
docker compose logs -f app
```

## 定时抓取

首版通过调用 `POST /api/ingest/run` 触发抓取。部署到单机后，可用系统 `cron` 周期性调用，例如：

```bash
curl -X POST http://localhost:3000/api/ingest/run
```
