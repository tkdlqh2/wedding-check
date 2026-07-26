// 실행 화면 (신입 오퍼레이터, 태블릿) — UJ-1, UJ-2 / FR-5, FR-6, FR-7, FR-8
function RunScreen({ vals }) {
  const { state: s, set } = vals;
  const { Btn, FocusInput, FocusTextarea, FOCUS_ORANGE } = window.WC;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 1024, width: '100%', margin: '0 auto', padding: '0 20px 40px' }}>

      {vals.showOffline && (
        <div style={{ background: '#fdf3e0', border: '1px solid #f5a623', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: 14, color: '#1f1f1f', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: 9999, background: '#f5a623', flex: 'none' }} />
          <span style={{ whiteSpace: 'normal' }}>
            <strong>오프라인 상태입니다.</strong> 체크리스트는 저장된 데이터로 계속 볼 수 있어요. 체크와 피드백은 저장되고 연결되면 자동 동기화됩니다. AI 질의만 잠시 사용할 수 없습니다.
          </span>
        </div>
      )}

      {/* 예식 헤더 카드 */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: '20px 24px', marginTop: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#888' }}>{vals.rw.date} · {vals.rw.hall}</div>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{vals.rw.time} {vals.rw.couple} 예식</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {vals.runContractChips.map((rc) => (
              <span key={rc} style={{ background: '#f7f7f7', border: '1px solid #e6e6e6', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600, color: '#555' }}>{rc}</span>
            ))}
            <span style={{ background: vals.runStatus[2], borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600, color: vals.runStatus[3] }}>{vals.runStatus[1]}</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#888' }}>체크 진행</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              <span style={{ color: '#1fa463' }}>{vals.doneCount}</span>
              <span style={{ color: '#bcbcbc' }}> / {vals.totalCount}</span>
            </div>
          </div>
          {vals.showStartBtn && (
            <Btn onClick={vals.startWedding} style={{ cursor: 'pointer', background: '#1fa463', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', fontSize: 15, fontWeight: 700 }} hoverStyle={{ background: '#188a52' }}>예식 시작</Btn>
          )}
          {vals.showEndBtn && (
            <Btn onClick={vals.endWedding} style={{ cursor: 'pointer', background: '#e0353b', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 22px', fontSize: 15, fontWeight: 700 }} hoverStyle={{ background: '#c52d32' }}>예식 종료</Btn>
          )}
          <Btn onClick={vals.goSchedule} style={{ cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 18px', fontSize: 15, fontWeight: 600, color: '#1f1f1f' }} hoverStyle={{ background: '#f7f7f7' }}>담당 예식 일정</Btn>
        </div>
      </div>

      {/* 체크리스트 */}
      <div style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 12px' }}>
        체크리스트 <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 6 }}>단계를 열어 항목별로 체크하세요</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {s.steps.map((st, i) => {
          const stepDone = st.items.filter((x) => x.done).length;
          const allDone = stepDone === st.items.length;
          const toggle = () => set({ steps: s.steps.map((x, j) => (j === i ? { ...x, expanded: !x.expanded } : x)) });
          return (
            <div key={i} style={{ background: '#fff', border: allDone ? '1px solid #1fa463' : '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }}>
              <Btn onClick={toggle} style={{ whiteSpace: 'normal', width: '100%', textAlign: 'left', cursor: 'pointer', background: allDone ? '#f7f7f7' : '#ffffff', border: 'none', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }} hoverStyle={{ background: '#f7f7f7' }}>
                <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: allDone ? '#1fa463' : '#f7f7f7', color: allDone ? '#ffffff' : '#555555' }}>{i + 1}</span>
                <span style={{ fontSize: 18, fontWeight: 600, color: allDone ? '#888888' : '#1f1f1f' }}>{st.name}</span>
                {allDone && <span style={{ background: '#1fa463', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>완료</span>}
                <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: allDone ? '#1fa463' : stepDone > 0 ? '#f5a623' : '#bcbcbc' }}>{stepDone} / {st.items.length}</span>
                <span style={{ color: '#888', fontSize: 12 }}>{st.expanded ? '▲' : '▼'}</span>
              </Btn>
              {st.expanded && (
                <div style={{ borderTop: '1px solid #e6e6e6', display: 'flex', flexDirection: 'column' }}>
                  {st.items.map((ci) => {
                    const hasDetail = !!(ci.detail || ci.video);
                    const detailOpen = !!s.detailOpen && s.detailOpen === ci.id;
                    const toggleItem = () => set({ steps: s.steps.map((x, j) => (j === i ? { ...x, items: x.items.map((y) => (y.id === ci.id ? { ...y, done: !y.done } : y)) } : x)) });
                    const toggleDetail = () => set({ detailOpen: s.detailOpen === ci.id ? null : ci.id });
                    return (
                      <div key={ci.id} style={{ borderBottom: '1px solid #f0f0f0', padding: '0 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
                          <button onClick={toggleItem} style={{ flex: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 9999, border: ci.done ? '2px solid #1fa463' : '2px solid #d4d4d4', background: ci.done ? '#1fa463' : '#ffffff', color: '#fff', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{ci.done ? '✓' : ''}</button>
                          <span style={{ whiteSpace: 'normal', fontSize: 16, fontWeight: 500, color: ci.done ? '#888888' : '#1f1f1f' }}>{ci.summary}</span>
                          {hasDetail && (
                            <Btn onClick={toggleDetail} style={{ marginLeft: 'auto', flex: 'none', cursor: 'pointer', background: '#fff', border: '1px solid #d4d4d4', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#555' }} hoverStyle={{ background: '#f7f7f7' }}>{detailOpen ? '접기 ▲' : '상세 ▼'}</Btn>
                          )}
                        </div>
                        {detailOpen && (
                          <div style={{ background: '#f7f7f7', borderRadius: 8, padding: '14px 16px', margin: '0 0 12px 40px', animation: 'wcenter 120ms cubic-bezier(0,0,0.2,1) both' }}>
                            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6, whiteSpace: 'normal' }}>{ci.detail}</div>
                            {ci.video && (
                              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, background: '#eef5fd', border: '1px solid #cfe2f7', borderRadius: 8, padding: '10px 14px' }}>
                                <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 9999, background: '#2b82e0', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>▶</span>
                                <div style={{ whiteSpace: 'normal' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2b82e0' }}>시연 영상 · {ci.videoLen}</div>
                                  <div style={{ fontSize: 12, color: '#888' }}>{ci.videoDesc}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FR-5/FR-6: 실행 중 자연어 질의 */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: '20px 24px', marginTop: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>지금 이런 상황인데 어떡하죠?</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>상황을 그대로 적으면 과거 유사 사례를 근거와 함께 찾아드립니다. 예: "주례자가 순서를 갑자기 바꿨어요"</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'stretch' }}>
          <FocusInput
            value={s.queryText}
            onChange={(e) => set({ queryText: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') vals.runQuery(); }}
            placeholder="지금 상황을 그대로 적어보세요"
            style={{ flex: 1, background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 14px', fontSize: 16, outline: 'none' }}
            focusStyle={window.WC.FOCUS_ORANGE}
          />
          <Btn onClick={vals.runQuery} style={{ flex: 'none', width: 120, background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ background: '#d14a26' }}>
            {s.queryLoading ? <vals.Spinner dark /> : '질의하기'}
          </Btn>
        </div>

        {s.queryResult && s.queryResult.matches && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {s.queryResult.matches.map((m, i) => (
              <div key={i} style={{ border: '1px solid #e6e6e6', borderRadius: 12, padding: 20, animation: 'wcenter 120ms cubic-bezier(0,0,0.2,1) both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: '#fdede7', color: '#e8552d', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>유사도 {i + 1}위 · {m.sim}%</span>
                  <span style={{ background: m.result === '잘 대처됨' ? '#1fa463' : '#e0353b', color: '#ffffff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{m.result}</span>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{m.meta}</span>
                </div>
                <div style={{ fontSize: 15, color: '#555', lineHeight: 1.5, marginTop: 10 }}>{m.situation}</div>
                <div style={{ borderTop: '1px solid #e6e6e6', marginTop: 12, paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>사후 판단 — 이렇게 하세요</div>
                  <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginTop: 4 }}>{m.judgment}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {s.queryResult && s.queryResult.none && (
          <div style={{ marginTop: 20, border: '1px solid #2b82e0', background: '#eef5fd', borderRadius: 12, padding: 20, animation: 'wcenter 120ms cubic-bezier(0,0,0.2,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#2b82e0', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>관련 사례 없음</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>관련 사례 없음 — 선임에게 연락하세요</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.5, marginTop: 6 }}>
              비슷하지 않은 사례를 억지로 보여드리지 않습니다. 지금 바로 <strong>담당 선임에게 연락</strong>하세요. 이 상황은 예식 종료 후 피드백으로 남겨두면 다음부터 검색됩니다.
            </div>
          </div>
        )}
      </div>

      {/* FR-7/FR-8: 예식 후 피드백 */}
      {vals.showFeedback && (
        <div style={{ marginTop: 36, borderTop: '2px solid #e6e6e6', paddingTop: 28, animation: 'wcenter 200ms cubic-bezier(0,0,0.2,1) both' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            예식 피드백 남기기 <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 6 }}>방금 종료된 {vals.rw.time} {vals.rw.couple} 예식</span>
          </div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 6 }}>기억이 생생할 때 적어주세요. 형식은 시스템이 알아서 정리합니다.</div>

          <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'rgba(0,0,0,0.06) 0px 2px 8px', padding: 24, marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>단계 선택 <span style={{ fontWeight: 400 }}>(선택 — 비워두면 자동 추정)</span></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {vals.stepNames.map((name) => (
                <button key={name} onClick={() => set({ fbStep: s.fbStep === name ? '' : name })} style={{ cursor: 'pointer', borderRadius: 9999, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: s.fbStep === name ? '#fdede7' : '#ffffff', border: s.fbStep === name ? '1px solid #e8552d' : '1px solid #d4d4d4', color: '#1f1f1f' }}>{name}</button>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginTop: 18 }}>무슨 일이 있었나요?</div>
            <FocusTextarea
              value={s.fbText}
              onChange={(e) => set({ fbText: e.target.value, fbDraftSaved: false })}
              rows={5}
              placeholder="정해진 형식 없이, 있었던 일을 그대로 적으세요. 예: 축가 순서에서 반주가 늦게 나왔는데 오퍼레이터가 당황해서 음향을 늦게 올렸음. 미리 반주 큐를 30초 전에 걸어놨어야 함."
              style={{ width: '100%', marginTop: 8, background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 14px', fontSize: 16, lineHeight: 1.5, resize: 'vertical', outline: 'none' }}
              focusStyle={window.WC.FOCUS_ORANGE}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Btn onClick={() => { if (s.fbText.trim()) set({ fbDraftSaved: true, fbPreview: null }); }} style={{ cursor: 'pointer', background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 600 }} hoverStyle={{ background: '#f7f7f7' }}>지금은 여기까지 (임시 저장)</Btn>
              <Btn onClick={vals.structureFb} style={{ cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 600, marginLeft: 'auto', minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }} hoverStyle={{ background: '#d14a26' }}>
                {s.fbLoading ? <vals.Spinner dark /> : '정리해서 보기'}
              </Btn>
            </div>
            {s.fbDraftSaved && <div style={{ marginTop: 12, fontSize: 13, color: '#f5a623', fontWeight: 600 }}>임시 저장됨 — 생각나면 언제든 이어서 쓸 수 있어요.</div>}
          </div>

          {s.fbPreview && (
            <div style={{ background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 24, marginTop: 16, animation: 'wcenter 200ms cubic-bezier(0,0,0.2,1) both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>이렇게 정리했어요</div>
                <div style={{ fontSize: 13, color: '#888' }}>확인하고 필요하면 고쳐주세요 — 자동 정리는 초안입니다.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                {[
                  ['단계', 'step'], ['상황 설명', 'situation'], ['사후 판단 (대처법 + 근거)', 'judgment'], ['태그', 'tags'],
                ].map(([label, key]) => (
                  <div key={key}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>{label}</div>
                    <FocusInput
                      value={s.fbPreview[key]}
                      onChange={(e) => vals.fbSet(key, e.target.value)}
                      style={{ width: '100%', marginTop: 6, background: '#fff', color: '#1f1f1f', border: '1px solid #d4d4d4', borderRadius: 8, padding: '10px 12px', fontSize: 15, outline: 'none' }}
                      focusStyle={window.WC.FOCUS_ORANGE}
                    />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>대처 결과</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {['잘 대처됨', '잘못 대처됨'].map((r) => {
                      const active = s.fbPreview.result === r;
                      return (
                        <button key={r} onClick={() => vals.fbSet('result', r)} style={{ cursor: 'pointer', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, background: active ? (r === '잘 대처됨' ? '#1fa463' : '#e0353b') : '#ffffff', border: active ? '1px solid transparent' : '1px solid #d4d4d4', color: active ? '#ffffff' : '#1f1f1f' }}>{r}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
                {s.fbSaved && <span style={{ background: '#1fa463', color: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600 }}>저장 완료 — 지금부터 실행 중 질의에서 검색됩니다</span>}
                <Btn
                  onClick={() => {
                    if (s.fbSaved || !s.fbPreview) { set({ fbSaved: true }); return; }
                    const p = s.fbPreview;
                    const kw = [...p.tags.split(/,\s*/), ...p.step.split(/\s+/), ...p.situation.split(/\s+/).filter((x) => x.length >= 2)];
                    set({ fbSaved: true, cases: [{ kw, sim: 95, result: p.result, situation: p.situation, judgment: p.judgment, meta: '오늘 · ' + p.step + ' 단계' }, ...s.cases] });
                  }}
                  style={{ cursor: 'pointer', background: '#e8552d', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 16, fontWeight: 600, marginLeft: 'auto' }}
                  hoverStyle={{ background: '#d14a26' }}
                >이대로 저장</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
