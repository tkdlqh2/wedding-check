"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// better-auth 클라이언트 SDK의 changePassword/signOut은 core 엔드포인트라 admin/phoneNumber
// 플러그인과 무관하게 authClient에 이미 포함돼 있다(node_modules/better-auth/dist/api/routes/
// update-user.mjs 확인 완료) — 별도 Server Action 없이 여기서 직접 호출한다.
export function AccountMenu() {
  const router = useRouter();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  function closeModal() {
    setIsPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setError(null);
    setSuccess(false);
  }

  useEffect(() => {
    if (!isPasswordOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPasswordOpen]);

  async function handleSignOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
    });

    setIsSubmitting(false);

    if (changeError) {
      if (changeError.code === "INVALID_PASSWORD") {
        setError("현재 비밀번호가 올바르지 않습니다");
      } else if (changeError.code === "PASSWORD_TOO_SHORT" || changeError.code === "PASSWORD_TOO_LONG") {
        setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다`);
      } else {
        setError(changeError.message ?? "비밀번호 변경에 실패했습니다");
      }
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setSuccess(true);
  }

  return (
    <div className="admin-nav__account">
      <button type="button" className="btn-secondary" onClick={() => setIsPasswordOpen(true)}>
        비밀번호 변경
      </button>
      <button type="button" className="btn-secondary" onClick={handleSignOut} disabled={isSigningOut}>
        {isSigningOut ? "로그아웃 중..." : "로그아웃"}
      </button>

      {isPasswordOpen && (
        <div className="account-modal-overlay" onClick={closeModal}>
          <div
            ref={dialogRef}
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="password-modal-title">비밀번호 변경</h2>
            {success ? (
              <>
                <p className="account-modal__success">비밀번호가 변경되었습니다.</p>
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  닫기
                </button>
              </>
            ) : (
              <form onSubmit={handleChangePassword} className="account-modal__form">
                <label htmlFor="current-password">현재 비밀번호</label>
                <input
                  id="current-password"
                  type="password"
                  className={error ? "input input--error" : "input"}
                  aria-invalid={Boolean(error)}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <label htmlFor="new-password">새 비밀번호</label>
                <input
                  id="new-password"
                  type="password"
                  className={error ? "input input--error" : "input"}
                  aria-invalid={Boolean(error)}
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  placeholder="8자 이상"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                {error && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="account-modal__actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    취소
                  </button>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "변경 중..." : "비밀번호 변경"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
