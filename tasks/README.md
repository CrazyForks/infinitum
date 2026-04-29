# Tasks

本目录保存任务计划、依赖分析、执行计划和执行结果。

| 路径 | 内容 |
| --- | --- |
| `quick/` | quick task、fix note、spike note |
| `plans/` | task plan；dependency analysis 和 execution plan 仅在并行需要时生成 |
| `results/` | task result、按 slug 分组的 integration report、test report、review report |
| `gates/` | H1/H2/H3/H4 的人类批准记录 |
| `archive/` | 已关闭任务资料 |

没有 task result 的任务不得进入 Integration。

Task plan 应优先拆成 vertical tracer bullets，并为每个任务标注 `Execution Mode: AFK/HITL`、`Human Touchpoint` 和 `Verification Surface`。HITL 任务需要明确人类触点，不能由 subagent 无人值守完成。
