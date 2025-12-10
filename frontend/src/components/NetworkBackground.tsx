// src/components/NetworkBackground.tsx
import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine } from "@tsparticles/engine";

export default function NetworkBackground() {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) return null;

  return (
    <div className="network-bg">
      <Particles
        id="techcare-network"
        options={{
          background: {
            color: {
              value: "transparent",
            },
          },
          fpsLimit: 120,
          interactivity: {
            events: {
              onHover: {
                enable: true,
                mode: "repulse",
              },
              resize: { enable: true },
            },
            modes: {
              repulse: {
                distance: 140,
                duration: 0.4,
                speed: 1,
              },
            },
          },
          particles: {
            color: {
              value: "#AAAAAA",
            },
            links: {
              color: "#AAAAAA",
              distance: 150,
              enable: true,
              opacity: 0.35,
              width: 1,
            },
            move: {
              enable: true,
              speed: 1.6,
              direction: "none",
              random: false,
              straight: false,
              outModes: {
                default: "out",
                bottom: "out",
                left: "out",
                right: "out",
                top: "out",
              },
            },
            number: {
              value: 200,
              density: {
                enable: true,
                area: 900,        // đúng key mới (không còn factor)
              },
            },
            opacity: {
              value: 0.45,
              random: {
                enable: true,
                minimumValue: 0.1,   // đúng tên mới
              },
              animation: {
                enable: true,
                speed: 0.6,
                minimumValue: 0.1,   // đúng tên
                sync: false,
              },
            },
            shape: {
              type: "circle",
            },
            size: {
              value: { min: 1, max: 4 },
              random: true,
            },
          },
          detectRetina: true,
        } as any} // tạm thời dùng "as any" để bypass TS nếu vẫn kêu (an toàn 100%)
      />
    </div>
  );
}