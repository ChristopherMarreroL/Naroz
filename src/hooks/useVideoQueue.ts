import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createVideoItem, isSupportedVideo } from '../lib/media'
import type { VideoItem } from '../types/video'

interface AddVideosResult {
  addedCount: number
  rejectedFiles: string[]
}

export function useVideoQueue() {
  const [videos, setVideos] = useState<VideoItem[]>([])
  const videosRef = useRef<VideoItem[]>([])

  useEffect(() => {
    videosRef.current = videos
  }, [videos])

  useEffect(() => {
    return () => {
      videosRef.current.forEach((video) => URL.revokeObjectURL(video.previewUrl))
    }
  }, [])

  const addVideos = useCallback(async (fileList: FileList | File[]): Promise<AddVideosResult> => {
    const files = Array.from(fileList)
    const supportedFiles = files.filter(isSupportedVideo)
    const rejectedFiles = files.filter((file) => !isSupportedVideo(file)).map((file) => file.name)

    const nextItems = await Promise.all(supportedFiles.map((file) => createVideoItem(file)))
    setVideos((current) => [...current, ...nextItems])

    return {
      addedCount: nextItems.length,
      rejectedFiles,
    }
  }, [])

  const removeVideo = useCallback((videoId: string) => {
    setVideos((current) => {
      const target = current.find((video) => video.id === videoId)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
      }

      return current.filter((video) => video.id !== videoId)
    })
  }, [])

  const clearVideos = useCallback(() => {
    setVideos((current) => {
      current.forEach((video) => URL.revokeObjectURL(video.previewUrl))
      return []
    })
  }, [])

  const moveVideo = useCallback((fromIndex: number, toIndex: number) => {
    setVideos((current) => {
      if (toIndex < 0 || toIndex >= current.length) {
        return current
      }

      const next = [...current]
      const [movedItem] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, movedItem)
      return next
    })
  }, [])

  const totalDuration = useMemo(
    () => videos.reduce((sum, video) => sum + (video.duration ?? 0), 0),
    [videos],
  )

  return {
    videos,
    addVideos,
    removeVideo,
    clearVideos,
    moveVideo,
    totalDuration,
  }
}
