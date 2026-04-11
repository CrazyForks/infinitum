"use client";

import { useState, useTransition } from "react";

import styles from "@/components/admin/admin.module.css";

export function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
      };

      if (!response.ok || payload.error) {
        setMessage(payload.error ?? "登录失败");
        return;
      }

      setMessage(null);
      window.location.href = "/admin/settings";
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.kicker}>Admin Access</div>
        <h1 className={styles.title}>管理员登录</h1>
        <p className={styles.description}>使用后台密码登录后，才可刷新数据、修改配置与重新生成内容。</p>
      </div>

      <label className={styles.field}>
        <span>管理员密码</span>
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {message ? <p className={styles.message}>{message}</p> : null}

      <button className={styles.primaryButton} type="button" onClick={submit} disabled={isPending || !password.trim()}>
        {isPending ? "登录中..." : "登录"}
      </button>
    </section>
  );
}
