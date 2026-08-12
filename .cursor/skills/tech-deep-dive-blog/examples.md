# Examples（golden references）

在 `personal-gpt` 仓库内写作时，先打开对应样例再动笔。

## Canonical posts

| 文件                                                                                              | 学什么                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [blog/phase-1-from-prototype-to-kb.md](../../../blog/phase-1-from-prototype-to-kb.md)             | 系列第 0 篇：全景、目录、自洽声明                   |
| [blog/phase-1-01-async-ingest.md](../../../blog/phase-1-01-async-ingest.md)                       | 长文标杆：取舍、表结构、幂等、观测、诚实边界、实测  |
| [blog/phase-1-02-query-router.md](../../../blog/phase-1-02-query-router.md)                       | 「五问」块最完整：是什么/为什么/优势/不做/原理+代码 |
| [blog/phase-1-03-streaming-citations.md](../../../blog/phase-1-03-streaming-citations.md)         | 协议与 UX 张力；流末事件；过滤器原理                |
| [blog/phase-1-04-dual-path-retrieve.md](../../../blog/phase-1-04-dual-path-retrieve.md)           | 较短深挖；升级时应补五问+诚实边界到 checklist 标准  |
| [blog/phase-1-05-workspace-isolation.md](../../../blog/phase-1-05-workspace-isolation.md)         | 同上，契约/断言类主题                               |
| [blog/phase-1-06-vectorstore-consistency.md](../../../blog/phase-1-06-vectorstore-consistency.md) | 同上，一致性/删除顺序类主题                         |

## Snippet：五问节标题模式

```markdown
## 3. ⟦机制名⟧：为什么、优势、不做会怎样、代码原理
```

或：

```markdown
## 3. 分别解决什么：为什么、优势、不做会怎样、代码原理
```

## Snippet：反事实表头

```markdown
| 若取消…            | 会发生什么 |
| ------------------ | ---------- |
| **整层 X，永远 Y** | …          |
```

## Snippet：对外自洽声明（引文第二行）

```markdown
> 本文含可独立阅读的完整核心代码，不依赖打开私有仓库。
```

## Outside this repo

若在其他项目使用本 skill：仍遵守 SKILL.md 底线与 TEMPLATE.md；样例改为该项目已达标的一篇复盘文，或仅用模板从零写。
