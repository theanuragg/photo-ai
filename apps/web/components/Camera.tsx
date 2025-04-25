"use client"
import { BACKEND_URL } from "@/app/config"
import axios from "axios";
import {  useEffect, useState } from "react"
import { ImageCard, ImageCardSkeleton, TImage } from "./ImageCard";
import {useAuth} from '@clerk/nextjs'

export function Camera() {
    const [images, setImages] = useState<TImage[]>([ ]);
    const [imagesLoading, setImagesLoading] = useState(true);
    const { userId } = useAuth();
  
    const [hovered, setHovered] = useState<number | null>(null);
  
    useEffect(() => {
      (async () => {
        try {
          const response = await axios.get(`${BACKEND_URL}/image/bulk`, {
            headers: { clerkId: userId },
          });
          setImages(response.data.images);
        } catch (error) {
          console.error('Failed to fetch images:', error);
        } finally {
          setImagesLoading(false);
        }
      })();
    }, [userId]);
  
    useEffect(() => {
      (async () => {
        if (images.find((x) => x.status !== "Generated")) {
          await new Promise((r) => setTimeout(r, 5000));
          const response = await axios.get(`${BACKEND_URL}/image/bulk`, {
            headers: {clerkId: userId},
          });
          setImages(response.data.images);
        }
      })();
    }, [images, userId]);
  
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {images.map((image, index) => (
          <ImageCard 
            key={index} 
            index={index} 
            hovered={hovered} 
            setHovered={setHovered} 
            {...image} 
          />
        ))}
        {imagesLoading && (
          <>
            <ImageCardSkeleton />
            <ImageCardSkeleton />
            
          </>
        )}
      </div>
    );
  }