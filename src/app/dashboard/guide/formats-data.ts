import { FORMATS } from "@/lib/formats";

export { FORMATS };

export const PIPELINE_STEPS_HINT = [
  { step: 1, label: "파일 업로드", detail: "드래그앤드롭 · 다중 업로드 · 진행률 · SHA-256" },
  { step: 2, label: "형식 및 무결성 검사", detail: "매직 바이트 · 확장자 일치 · 잘린 파일 검사" },
  { step: 3, label: "2D/3D 자동 판별", detail: "도면/이미지/메시/CAD 구분" },
  { step: 4, label: "부품 구조·계층 분석", detail: "glTF 노드 · OBJ 그룹 · STL 연결 요소 · DXF 레이어 · 이미지 윤곽(잉크 영역)" },
  { step: 5, label: "모델 변환", detail: "내장 변환기 또는 외부 변환 안내" },
  { step: 6, label: "웹 표시용 GLB 생성", detail: "glTF 2.0 바이너리 직접 인코딩" },
  { step: 7, label: "메시 최적화", detail: "중복 정점 병합 · 퇴화 삼각형 제거" },
  { step: 8, label: "썸네일 생성", detail: "서버 SVG 생성 → 뷰어 캡처로 교체 가능" },
  { step: 9, label: "쇼룸 프로젝트 저장", detail: "부품 정보·분해 벡터·애니메이션·카메라 프리셋" },
  { step: 10, label: "3D 뷰어 자동 실행", detail: "Three.js/WebGL 실시간 렌더링" },
];
