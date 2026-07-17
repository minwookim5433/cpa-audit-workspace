/** 답안지 기호 입력 툴바 */
export const ANSWER_SYMBOLS = [
  { char: "①", title: "동그라미 1" },
  { char: "②", title: "동그라미 2" },
  { char: "③", title: "동그라미 3" },
  { char: "④", title: "동그라미 4" },
  { char: "⑤", title: "동그라미 5" },
  { char: "⑥", title: "동그라미 6" },
  { char: "⑦", title: "동그라미 7" },
  { char: "⑧", title: "동그라미 8" },
  { char: "⑨", title: "동그라미 9" },
  { char: "⑩", title: "동그라미 10" },
  { char: "→", title: "오른쪽 화살표" },
  { char: "←", title: "왼쪽 화살표" },
  { char: "↑", title: "위쪽 화살표" },
  { char: "↓", title: "아래쪽 화살표" },
  { char: "×", title: "곱하기" },
  { char: "÷", title: "나누기" },
  { char: "±", title: "플러스마이너스" },
  { char: "°", title: "도" },
  { char: "·", title: "가운데점" },
  { char: "※", title: "별표" },
  { char: "○", title: "원" },
  { char: "△", title: "삼각형" },
  { char: "□", title: "사각형" },
  { char: "▽", title: "역삼각형" },
];

export function renderAnswerSymbolToolbar(container) {
  if (!container) return;
  container.innerHTML = ANSWER_SYMBOLS.map(
    ({ char, title }) =>
      `<button type="button" class="ws-symbol-btn" data-symbol="${char}" title="${title}">${char}</button>`
  ).join("");
}
