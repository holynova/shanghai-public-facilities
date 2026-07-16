# 开发交接

## 本地启动

```bash
cd /Users/sym/Code/shanghai_public_facilities
cp .env.example .env
npm install
npm run check:env
```

在`.env`中填入高德开放平台的**Web服务**Key：

```dotenv
AMAP_WEB_KEY=your-real-key
```

`AMAP_MCP_KEY`是可选配置，仅用于人工MCP复核；它与`AMAP_WEB_KEY`填写同一个高德“Web服务”Key。

Codex中的高德MCP通过`/Users/sym/Code/shanghai_public_facilities/scripts/amap-mcp.sh`
启动。该启动器只读取被忽略的本地`.env`，不会把Key写入`~/.codex/config.toml`。

## 安全要求

- `.env`不能提交到Git。
- 不得记录、打印或输出真实Key。
- 不得绕过验证码、登录和反爬限制。
- 高德POI分类不能替代官方医院等级。

## 已实现的采集与导出

```bash
# 文化设施：官方清单下载、规范化、坐标匹配
npm run cli -- sources fetch-culture --snapshot 2026-07-13
npm run cli -- sources normalize-culture --snapshot 2026-07-13
npm run cli -- amap enrich-culture --snapshot 2026-07-13 --resume

# 地铁：按高德地铁线路的站序采集，避免 POI 关键词分页遗漏
npm run cli -- amap collect-metro-lines --snapshot 2026-07-16

# 社区卫生机构、高德医院关键词候选
npm run cli -- amap collect primary-care --snapshot 2026-07-16
npm run cli -- amap collect hospital --snapshot 2026-07-16

# 医院：官方评审公告快照与高德坐标匹配
npm run cli -- amap enrich-official-hospitals --snapshot 2026-07-16 --resume

# 导出
npm run cli -- export all --culture-snapshot 2026-07-13 --amap-snapshot 2026-07-16 --output-snapshot 2026-07-16
```

## 当前结果（2026-07-16）

- 主清单：`outputs/2026-07-16/shanghai-public-facilities.csv`。
- 质量报告：`outputs/2026-07-16/quality-report.json`。
- 医院关键词候选审核文件：`outputs/2026-07-16/hospital-grade-candidates-review.csv`，不得并入主清单医院等级统计。
- 坐标均为高德 GCJ-02。
- 文化来源是上海市文化和旅游局公开名录；POI 匹配失败时可按官方地址回退地理编码，标记为`geocoded`。
- 医院三甲、二甲来自六份上海卫健委公开评审公告（2020、2021、2023 两份、2025、2026），是可追溯快照，不等同于实时、完整的全市等级注册表。

## 已验证的数据缺口

截至本次快照，上海市政府页面列出的“上海医疗服务信息便民查询平台”（`jg.soyi.sh.cn`）及“上海市医疗机构名称查询系统”（`soyi.sh.cn/p/nameTest`）均返回 HTTP 404。公开卫健委页面可检索到分批等级评审公告，但没有可下载的全市当前三甲／二甲完整动态名录。因此，若要将医院等级部分升级为“全市实时全量”，后续接手方需要获得以下任一来源：

- 上海卫健委或医保局的机构等级导出（CSV、Excel、开放数据 API）；或
- 获授权的医疗机构查询系统接口／登录会话；或
- 用户提供的权威名录文件。

优先推荐的数据源是上海公共数据开放平台的“医保定点医疗机构表”（数据集 ID：`O5915184142025253`，页面链接：`https://data.sh.gov.cn/view/detail/index.html?type=jk&id=O5915184142025253`）。公开目录说明该表来源于上海医保信息平台，字段含医院名称、结算等级、地址和所属区。当前运行环境访问该页未获得公开下载内容；如能手动下载，请将原始文件放入`data/manual/`，后续可据此扩展医院等级主清单。

CSV 导入命令：

```bash
# 文件：data/manual/medical-institutions.csv
# 必需列：医院名称（或 医疗机构名称/机构名称）、结算等级（或 医院等级/机构等级）
# 可选列：地址、所属区
npm run cli -- sources import-medical-institutions --snapshot 2026-07-16
```

导入结果写入`data/interim/<snapshot>/medical-institutions-import.json`。只有原始等级字段明确包含“三级甲等／三甲”或“二级甲等／二甲”时，才会生成相应类别候选；其余“结算等级”必须人工确认语义后才可合并到医院等级主清单。

在未取得该来源前，禁止把 `hospital-grade-candidates-review.csv` 的高德关键词候选并入主清单的三甲／二甲统计。

## 验证

```bash
npm run check:env
npm run typecheck
npm test -- --run src/sources/normalize-medical-institution-import.test.ts
npm run cli -- export all --culture-snapshot 2026-07-13 --amap-snapshot 2026-07-16 --output-snapshot 2026-07-16
```
