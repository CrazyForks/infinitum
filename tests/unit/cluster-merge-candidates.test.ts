import { describe, expect, it } from "vitest";

import { CLUSTER_MERGE_CANDIDATE_LIMIT, CLUSTER_MERGE_TARGET_CANDIDATE_COUNT } from "@/config/constants";
import {
  buildClusterMergeCandidateInputHash,
  buildClusterMergeCandidates,
  buildClusterMergeCandidateSelection,
  type ClusterMergeCandidate,
} from "@/lib/clusters/helpers";

function createCandidate(overrides: Partial<ClusterMergeCandidate>): ClusterMergeCandidate {
  return {
    id: "cluster",
    title: "聚合标题",
    summary: "聚合摘要",
    fingerprint: "fingerprint",
    mergeInputHash: null,
    eventType: null,
    eventSubject: null,
    eventAction: null,
    eventObject: null,
    eventDate: null,
    itemCount: 1,
    latestPublishedAt: new Date("2026-04-20T09:00:00.000Z"),
    ...overrides,
  };
}

describe("buildClusterMergeCandidates", () => {
  it("does not keep existing multi-item clusters when no merge anchor is found", () => {
    const candidates = buildClusterMergeCandidates([
      createCandidate({
        id: "multi-product-a",
        title: "Acme 发布产品 A",
        summary: "Acme 发布产品 A。",
        fingerprint: "multi-product-a",
        eventType: "launch",
        eventSubject: "Acme",
        eventAction: "发布",
        eventObject: "产品 A",
        eventDate: "2026-04-20",
        itemCount: 2,
      }),
      createCandidate({
        id: "multi-funding-b",
        title: "Beta 完成 B 轮融资",
        summary: "Beta 获得新一轮融资。",
        fingerprint: "multi-funding-b",
        eventType: "funding",
        eventSubject: "Beta",
        eventAction: "融资",
        eventObject: "B 轮",
        eventDate: "2026-04-21",
        itemCount: 3,
        latestPublishedAt: new Date("2026-04-21T10:00:00.000Z"),
      }),
    ]);

    expect(candidates).toEqual([]);
  });

  it("keeps multi-subject singleton events when object, action, date, and text anchors align", () => {
    const candidates = buildClusterMergeCandidates([
      createCandidate({
        id: "openai-contract",
        title: "OpenAI 与微软调整合作合同",
        summary: "OpenAI 和微软调整云服务合作合同条款。",
        fingerprint: "openai-contract",
        eventType: "partnership",
        eventSubject: "OpenAI",
        eventAction: "变更",
        eventObject: "微软合同",
        eventDate: "2026-04-20",
      }),
      createCandidate({
        id: "microsoft-contract",
        title: "微软和 OpenAI 调整合作协议",
        summary: "微软与 OpenAI 对合作合同进行变更。",
        fingerprint: "microsoft-contract",
        eventType: "partnership",
        eventSubject: "微软",
        eventAction: "变更",
        eventObject: "OpenAI 合同",
        eventDate: "2026-04-20",
        latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
      }),
    ]);

    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(["microsoft-contract", "openai-contract"]);
  });

  it("skips already evaluated merge pairs when neither side changed", () => {
    const openaiContract = createCandidate({
      id: "openai-contract",
      title: "OpenAI 与微软调整合作合同",
      summary: "OpenAI 和微软调整云服务合作合同条款。",
      fingerprint: "openai-contract",
      eventType: "partnership",
      eventSubject: "OpenAI",
      eventAction: "变更",
      eventObject: "微软合同",
      eventDate: "2026-04-20",
      itemCount: 10,
    });
    const microsoftContract = createCandidate({
      id: "microsoft-contract",
      title: "微软和 OpenAI 调整合作协议",
      summary: "微软与 OpenAI 对合作合同进行变更。",
      fingerprint: "microsoft-contract",
      eventType: "partnership",
      eventSubject: "微软",
      eventAction: "变更",
      eventObject: "OpenAI 合同",
      eventDate: "2026-04-20",
      itemCount: 1,
      latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
    });

    const candidates = buildClusterMergeCandidates([
      {
        ...openaiContract,
        mergeInputHash: buildClusterMergeCandidateInputHash(openaiContract),
      },
      {
        ...microsoftContract,
        mergeInputHash: buildClusterMergeCandidateInputHash(microsoftContract),
      },
    ]);

    expect(candidates).toEqual([]);
  });

  it("keeps evaluated neighbors when a related candidate is new or changed", () => {
    const evaluatedContract = createCandidate({
      id: "openai-contract",
      title: "OpenAI 与微软调整合作合同",
      summary: "OpenAI 和微软调整云服务合作合同条款。",
      fingerprint: "openai-contract",
      eventType: "partnership",
      eventSubject: "OpenAI",
      eventAction: "变更",
      eventObject: "微软合同",
      eventDate: "2026-04-20",
    });
    const changedContract = createCandidate({
      id: "microsoft-contract",
      title: "微软和 OpenAI 调整合作协议",
      summary: "微软与 OpenAI 对合作合同进行变更。",
      fingerprint: "microsoft-contract",
      eventType: "partnership",
      eventSubject: "微软",
      eventAction: "变更",
      eventObject: "OpenAI 合同",
      eventDate: "2026-04-20",
      latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
    });

    const candidates = buildClusterMergeCandidates([
      {
        ...evaluatedContract,
        mergeInputHash: buildClusterMergeCandidateInputHash(evaluatedContract),
      },
      {
        ...changedContract,
        mergeInputHash: "stale-hash",
      },
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual(["microsoft-contract", "openai-contract"]);
  });

  it("rejects pairs that only share subject, action, and date but conflict on object", () => {
    const candidates = buildClusterMergeCandidates([
      createCandidate({
        id: "product-a",
        title: "Acme 发布产品 A",
        summary: "Acme 发布产品 A。",
        fingerprint: "product-a",
        eventType: "launch",
        eventSubject: "Acme",
        eventAction: "发布",
        eventObject: "产品 A",
        eventDate: "2026-04-20",
      }),
      createCandidate({
        id: "product-b",
        title: "Acme 发布产品 B",
        summary: "Acme 发布产品 B。",
        fingerprint: "product-b",
        eventType: "launch",
        eventSubject: "Acme",
        eventAction: "发布",
        eventObject: "产品 B",
        eventDate: "2026-04-20",
        latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
      }),
    ]);

    expect(candidates).toEqual([]);
  });

  it("uses soft object-conflict candidates to recover same-subject events with strong text overlap", () => {
    const candidates = buildClusterMergeCandidates([
      createCandidate({
        id: "deepseek-vision-mode",
        title: "DeepSeek灰度测试识图模式拓展图文交互",
        summary: "DeepSeek 在网页版灰度测试上线识图模式，支持图片理解和多模态识别能力。",
        fingerprint: "deepseek-vision-mode",
        eventType: "update",
        eventSubject: "DeepSeek",
        eventAction: "上线",
        eventObject: "识图模式",
      }),
      createCandidate({
        id: "deepseek-multimodal-vision",
        title: "DeepSeek 开启识图模式灰度测试，多模态视觉理解能力正式落地",
        summary: "DeepSeek 正式开启多模态识图功能灰度测试，新增识图模式入口和视觉理解能力。",
        fingerprint: "deepseek-multimodal-vision",
        eventType: "update",
        eventSubject: "DeepSeek",
        eventAction: "开启灰度测试",
        eventObject: "多模态识图功能",
        latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
      }),
    ]);

    expect(candidates.map((candidate) => candidate.id).sort()).toEqual([
      "deepseek-multimodal-vision",
      "deepseek-vision-mode",
    ]);
  });

  it("stops soft object-conflict expansion at the target candidate budget", () => {
    const { candidates, diagnostics } = buildClusterMergeCandidateSelection(
      Array.from({ length: CLUSTER_MERGE_TARGET_CANDIDATE_COUNT + 20 }, (_, index) =>
        createCandidate({
          id: `openai-stargate-${index}`,
          title:
            index % 2 === 0
              ? `OpenAI 调整星际之门计划 ${index}`
              : `OpenAI 构建 Stargate 算力基础设施 ${index}`,
          summary: "OpenAI 围绕 Stargate 与星际之门计划调整算力基础设施布局。",
          fingerprint: `openai-stargate-${index}`,
          eventType: index % 2 === 0 ? "other" : "release",
          eventSubject: "OpenAI",
          eventAction: index % 2 === 0 ? "调整战略" : "发布",
          eventObject: index % 2 === 0 ? `alpha-${index}` : `beta-${index}`,
          latestPublishedAt: new Date(`2026-04-20T${String(index % 24).padStart(2, "0")}:00:00.000Z`),
        }),
      ),
    );

    expect(candidates).toHaveLength(CLUSTER_MERGE_TARGET_CANDIDATE_COUNT);
    expect(diagnostics.softObjectConflictSelectedPairs).toBeGreaterThan(0);
  });

  it("caps large merge candidate pools before sending them to AI", () => {
    const candidates = buildClusterMergeCandidates(
      Array.from({ length: CLUSTER_MERGE_CANDIDATE_LIMIT + 20 }, (_, index) =>
        createCandidate({
          id: `openai-contract-${index}`,
          title: `OpenAI 与微软调整合作合同 ${index}`,
          summary: "OpenAI 和微软调整云服务合作合同条款。",
          fingerprint: `openai-contract-${index}`,
          eventType: "partnership",
          eventSubject: index % 2 === 0 ? "OpenAI" : "微软",
          eventAction: "变更",
          eventObject: index % 2 === 0 ? "微软合同" : "OpenAI 合同",
          eventDate: "2026-04-20",
          latestPublishedAt: new Date(`2026-04-20T${String(index % 24).padStart(2, "0")}:00:00.000Z`),
        }),
      ),
    );

    expect(candidates).toHaveLength(CLUSTER_MERGE_CANDIDATE_LIMIT);
  });
});
