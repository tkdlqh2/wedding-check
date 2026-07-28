"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { normalizePhoneNumber } from "@/lib/phone";
import "../login.css";

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { data, error: signInError } = await authClient.signIn.phoneNumber({
      phoneNumber: normalizePhoneNumber(phoneNumber),
      password,
    });

    setIsSubmitting(false);

    if (signInError) {
      setError("전화번호 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    const role = data?.user?.role;
    router.push(role === "admin" ? "/admin" : "/operator");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-card__brand">웨딩체크</h1>
        <p className="login-card__subtitle">전화번호로 로그인하세요</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__field">
            <label htmlFor="phoneNumber">전화번호</label>
            <input
              id="phoneNumber"
              className="input"
              type="tel"
              inputMode="numeric"
              placeholder="01012345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(normalizePhoneNumber(e.target.value))}
              required
            />
          </div>
          <div className="login-form__field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              className={error ? "input input--error" : "input"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary login-form__submit" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}
