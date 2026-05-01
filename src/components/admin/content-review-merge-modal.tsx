import { Button } from "@/components/ui/button";
import { IconMerge, IconRotateCw } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { getClusterDisplayTitle } from "@/lib/feed/cluster-display";
import type { ClusterDTO } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";

type ContentReviewMergeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  targetCluster: ClusterDTO | null;
  availableClusters: ClusterDTO[];
  selectedClusterIds: Set<string>;
  searchQuery: string;
  isMerging: boolean;
  onSearchQueryChange: (value: string) => void;
  onToggleSource: (clusterId: string) => void;
  onExecuteMerge: () => void;
};

export function ContentReviewMergeModal({
  isOpen,
  onClose,
  targetCluster,
  availableClusters,
  selectedClusterIds,
  searchQuery,
  isMerging,
  onSearchQueryChange,
  onToggleSource,
  onExecuteMerge,
}: ContentReviewMergeModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="合并聚合组"
      widthClassName="max-w-3xl"
      headerClassName="border-b border-[color:var(--line)] p-4"
      bodyClassName="p-4 space-y-4"
      footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button
            onClick={onExecuteMerge}
            variant="primary"
            disabled={selectedClusterIds.size === 0 || isMerging}
          >
            {isMerging ? (
              <>
                <IconRotateCw className="h-4 w-4 mr-1 animate-spin" />
                合并中...
              </>
            ) : (
              <>
                <IconMerge className="h-4 w-4 mr-1" />
                确认合并 ({selectedClusterIds.size} 个)
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[color:var(--line)] bg-[var(--bg-muted)] p-4">
          <h4 className="text-sm font-semibold text-[var(--text-1)] mb-2">操作说明</h4>
          <ul className="text-sm text-[var(--text-2)] space-y-1 list-disc list-inside">
            <li>选中的聚合组条目将被合并到当前聚合组</li>
            <li>合并后，被合并的聚合组将被隐藏，其条目归属到当前聚合组</li>
            <li>系统会自动重新生成当前聚合组的摘要</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">目标聚合组（当前）</h4>
          <div className="rounded-lg border border-[color:var(--accent-soft)] bg-[var(--accent-soft)]/30 p-3">
            <div className="font-medium text-sm text-[var(--foreground)]">
              {targetCluster?.title ?? "加载中..."}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              {targetCluster ? `${targetCluster.itemCount} 条内容 · 质量分: ${targetCluster.score}` : ""}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">
            选择要合并的聚合组
            {selectedClusterIds.size > 0 && (
              <span className="ml-2 text-xs font-normal text-[var(--accent-strong)]">
                已选择 {selectedClusterIds.size} 个
              </span>
            )}
          </h4>

          <div className="relative">
            <input
              type="text"
              placeholder="搜索聚合组标题..."
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              className={cx(
                "w-full min-h-10 rounded-xl border border-[color:var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm",
                "text-[var(--foreground)] outline-none transition",
                "placeholder:text-[var(--muted)]",
                "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]",
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-1 border border-[color:var(--line)] rounded-lg p-2">
            {availableClusters.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-4">
                {searchQuery.trim() ? "未找到匹配的聚合组" : "暂无可合并的聚合组"}
              </p>
            ) : (
              availableClusters.map((cluster) => {
                const clusterDisplayTitle = getClusterDisplayTitle(cluster);

                return (
                  <label
                    key={cluster.id}
                    className={cx(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      selectedClusterIds.has(cluster.id)
                        ? "bg-[var(--accent-soft)] border border-[color:var(--accent)]"
                        : "hover:bg-[var(--surface)] border border-transparent",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClusterIds.has(cluster.id)}
                      onChange={() => onToggleSource(cluster.id)}
                      className="h-4 w-4 text-[var(--accent)] rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-[var(--foreground)] truncate">
                        {clusterDisplayTitle}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {cluster.itemCount} 条内容 · 质量分: {cluster.score}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
