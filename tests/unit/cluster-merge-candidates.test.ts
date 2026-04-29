import { describe, expect, it } from "vitest";

import { buildClusterMergeCandidates, type ClusterMergeCandidate } from "@/lib/clusters/helpers";

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
  it("keeps existing multi-item clusters even when pair score is weak", () => {
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

    expect(candidates.map((candidate) => candidate.id)).toEqual(["multi-funding-b", "multi-product-a"]);
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
});
