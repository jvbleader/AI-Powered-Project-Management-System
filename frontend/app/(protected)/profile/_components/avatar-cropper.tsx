"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import styles from "../styles/profile.module.css";
import { getCroppedImg } from "@/lib/utils/crop-image";

interface AvatarCropperProps {
  imageSrc: string;
  onSave: (croppedImageBase64: string) => void;
  onCancel: () => void;
}

export function AvatarCropper({ imageSrc, onSave, onCancel }: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedImage) {
        onSave(croppedImage);
      }
    } catch (e) {
      console.error(e);
      onCancel();
    }
  };

  return (
    <div className={styles.cropperModalOverlay}>
      <div className={styles.cropperModalContent}>
        <div className={styles.cropperHeader}>
          <h3>Chỉnh sửa ảnh đại diện</h3>
        </div>
        
        <div className={styles.cropperContainer}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className={styles.cropperControls}>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-label="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className={styles.zoomSlider}
          />
        </div>

        <div className={styles.cropperFooter}>
          <button type="button" onClick={onCancel} className={styles.cropperCancelBtn}>
            Hủy
          </button>
          <button type="button" onClick={handleSave} className={styles.cropperSaveBtn}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
