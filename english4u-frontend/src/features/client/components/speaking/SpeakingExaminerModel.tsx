import { type FC, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SpeakingVisemeCode } from '../../lib/speakingPlayback';

interface SpeakingExaminerModelProps {
    activeViseme: SpeakingVisemeCode;
    isPromptPlaying: boolean;
    isRecording: boolean;
    audioLevel: number;
    modelUrl?: string;
    onAvailabilityChange?: (isAvailable: boolean) => void;
}

type MorphTargetBinding = {
    dictionary: Record<string, number>;
    influences: number[];
};

const DEFAULT_CAMERA_DISTANCE = 1.08;
const DEFAULT_MODEL_URL = ((import.meta as any).env.VITE_SPEAKING_EXAMINER_MODEL_URL as string | undefined)?.trim()
    || '/avatars/examiner.glb';

const VISEME_TARGETS: Record<SpeakingVisemeCode, string[]> = {
    A: ['viseme_aa', 'jawOpen', 'mouthOpen', 'MouthOpen'],
    B: ['viseme_PP', 'mouthClose', 'MouthClose'],
    C: ['viseme_I', 'viseme_CH', 'viseme_E', 'mouthSmileLeft', 'mouthSmileRight'],
    D: ['viseme_TH', 'viseme_DD', 'viseme_nn'],
    E: ['viseme_E', 'viseme_RR', 'viseme_I'],
    F: ['viseme_FF', 'mouthFunnel', 'MouthFunnel'],
    G: ['viseme_O', 'viseme_U', 'mouthPucker', 'MouthPucker'],
    H: ['viseme_kk', 'viseme_SS', 'viseme_RR'],
    X: ['viseme_sil', 'sil', 'Sil', 'neutral', 'Neutral'],
};

const isMorphableMesh = (object: THREE.Object3D): object is THREE.Mesh & {
    morphTargetDictionary: Record<string, number>;
    morphTargetInfluences: number[];
} => {
    const mesh = object as THREE.Mesh;
    return !!mesh.isMesh && !!mesh.morphTargetDictionary && !!mesh.morphTargetInfluences;
};

const findMorphIndex = (dictionary: Record<string, number>, names: string[]) => {
    for (const name of names) {
        const exactIndex = dictionary[name];
        if (exactIndex != null) {
            return exactIndex;
        }

        const normalizedName = name.toLowerCase();
        const matchedKey = Object.keys(dictionary).find((key) => key.toLowerCase() === normalizedName);
        if (matchedKey) {
            return dictionary[matchedKey];
        }
    }

    return null;
};

const findObjectByNamePattern = (root: THREE.Object3D, patterns: RegExp[]) => {
    let matchedObject: THREE.Object3D | null = null;
    root.traverse((object) => {
        if (matchedObject) {
            return;
        }

        if (patterns.some((pattern) => pattern.test(object.name))) {
            matchedObject = object;
        }
    });

    return matchedObject;
};

const findObjectByPreferredNames = (root: THREE.Object3D, names: string[], fallbackPatterns: RegExp[]) => (
    names
        .map((name) => root.getObjectByName(name))
        .find(Boolean)
    ?? findObjectByNamePattern(root, fallbackPatterns)
);

export const SpeakingExaminerModel: FC<SpeakingExaminerModelProps> = ({
    activeViseme,
    isPromptPlaying,
    isRecording,
    audioLevel,
    modelUrl = DEFAULT_MODEL_URL,
    onAvailabilityChange,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const stateRef = useRef({
        activeViseme,
        isPromptPlaying,
        isRecording,
        audioLevel,
    });

    useEffect(() => {
        stateRef.current = {
            activeViseme,
            isPromptPlaying,
            isRecording,
            audioLevel,
        };
    }, [activeViseme, audioLevel, isPromptPlaying, isRecording]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        let disposed = false;
        let frameId: number | null = null;
        let modelRoot: THREE.Object3D | null = null;
        let faceTargetRef: THREE.Vector3 | null = null;
        let headHeightRef = 0.28;
        const morphBindings: MorphTargetBinding[] = [];

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
        camera.position.set(0, 1.35, 3.2);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.HemisphereLight(0xffffff, 0xbfd7ff, 1.8);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
        keyLight.position.set(2.5, 3.5, 4);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x8fb7ff, 1.2);
        fillLight.position.set(-3, 1.4, 2);
        scene.add(fillLight);

        const updateCameraForContainer = () => {
            const width = container.clientWidth || 1;
            const height = container.clientHeight || 1;
            const aspect = width / height;
            const faceTarget = faceTargetRef ?? new THREE.Vector3(0, 0.08, 0);
            const verticalDistance = headHeightRef * 3.2;
            const horizontalDistance = aspect < 1.55
                ? verticalDistance * (1.55 / Math.max(0.75, aspect))
                : verticalDistance;
            const cameraDistance = Math.max(DEFAULT_CAMERA_DISTANCE, horizontalDistance);

            camera.aspect = width / height;
            camera.position.set(faceTarget.x, faceTarget.y, faceTarget.z + cameraDistance);
            camera.lookAt(faceTarget);
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        };

        const frameModel = (root: THREE.Object3D) => {
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const height = size.y || 1;

            root.position.sub(center);
            root.scale.setScalar(3.35 / height);
            root.updateMatrixWorld(true);

            const headObject = findObjectByPreferredNames(root, ['Head', 'AvatarHead'], [/^Head$/i, /AvatarHead/i]);
            const headTopObject = findObjectByPreferredNames(root, ['HeadTop_End'], [/HeadTop/i]);
            const neckObject = findObjectByPreferredNames(root, ['Neck', 'Neck1', 'Neck2'], [/^Neck2?$/i, /^Neck$/i]);

            const headPosition = headObject
                ? headObject.getWorldPosition(new THREE.Vector3())
                : new THREE.Vector3(0, height * 0.2, 0);
            const headTopPosition = headTopObject
                ? headTopObject.getWorldPosition(new THREE.Vector3())
                : headPosition.clone().add(new THREE.Vector3(0, height * 0.12, 0));
            const neckPosition = neckObject
                ? neckObject.getWorldPosition(new THREE.Vector3())
                : headPosition.clone().add(new THREE.Vector3(0, -height * 0.1, 0));
            const faceTarget = headPosition.clone().lerp(headTopPosition, 0.42);
            const headHeight = Math.max(0.28, Math.abs(headTopPosition.y - neckPosition.y));
            faceTargetRef = faceTarget;
            headHeightRef = headHeight;
            updateCameraForContainer();
        };

        const applyLipSync = () => {
            const { activeViseme: currentViseme, isPromptPlaying: promptPlaying, audioLevel: level } = stateRef.current;
            const targetNames = promptPlaying ? VISEME_TARGETS[currentViseme] : VISEME_TARGETS.X;
            const targetWeight = promptPlaying && currentViseme !== 'X'
                ? Math.min(1, 0.32 + level * 0.85)
                : 0;

            morphBindings.forEach(({ dictionary, influences }) => {
                for (let index = 0; index < influences.length; index += 1) {
                    influences[index] += (0 - influences[index]) * 0.42;
                }

                const morphIndex = findMorphIndex(dictionary, targetNames);
                if (morphIndex != null) {
                    influences[morphIndex] += (targetWeight - (influences[morphIndex] ?? 0)) * 0.68;
                }
            });
        };

        const tick = () => {
            if (disposed) {
                return;
            }

            applyLipSync();

            renderer.render(scene, camera);
            frameId = window.requestAnimationFrame(tick);
        };

        const loader = new GLTFLoader();
        loader.load(
            modelUrl,
            (gltf) => {
                if (disposed) {
                    return;
                }

                modelRoot = gltf.scene;
                const morphTargetNames: string[] = [];

                modelRoot.traverse((object) => {
                    if (isMorphableMesh(object)) {
                        morphTargetNames.push(...Object.keys(object.morphTargetDictionary));
                        morphBindings.push({
                            dictionary: object.morphTargetDictionary,
                            influences: object.morphTargetInfluences,
                        });
                    }
                });

                if ((import.meta as any).env.DEV && morphTargetNames.length > 0) {
                    console.info('[SpeakingExaminerModel] GLB morph targets:', Array.from(new Set(morphTargetNames)).sort());
                }

                frameModel(modelRoot);
                scene.add(modelRoot);
                updateCameraForContainer();
                onAvailabilityChange?.(true);
                tick();
            },
            undefined,
            () => {
                onAvailabilityChange?.(false);
            },
        );

        const resizeObserver = new ResizeObserver(updateCameraForContainer);
        resizeObserver.observe(container);

        return () => {
            disposed = true;
            if (frameId != null) {
                window.cancelAnimationFrame(frameId);
            }
            resizeObserver.disconnect();
            onAvailabilityChange?.(false);

            scene.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (!mesh.isMesh) {
                    return;
                }

                mesh.geometry?.dispose();
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach((material) => material?.dispose());
            });

            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [modelUrl, onAvailabilityChange]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                inset: 0,
            }}
        />
    );
};
