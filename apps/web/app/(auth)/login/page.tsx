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
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>웨딩체크 로그인</h1>
        <label htmlFor="phoneNumber">전화번호</label>
        <input
          id="phoneNumber"
          type="tel"
          inputMode="numeric"
          placeholder="01012345678"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(normalizePhoneNumber(e.target.value))}
          required
        />
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
