import Image from "next/image";

export function AiRobotFace({ className = "" }: { className?: string }) {
  return (
    <span className={`ai-robot-face ${className}`.trim()} aria-hidden="true">
      <Image
        alt=""
        fill
        sizes="48px"
        src="/brand/aio-boost-robot-face.png"
      />
    </span>
  );
}

export function AiRobotPortrait() {
  return (
    <div className="ai-robot-portrait" aria-hidden="true">
      <Image
        alt=""
        height={512}
        priority
        sizes="(max-width: 680px) 90px, 160px"
        src="/brand/aio-boost-robot-assistant.png"
        width={341}
      />
    </div>
  );
}
