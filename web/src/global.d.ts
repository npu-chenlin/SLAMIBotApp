// global.d.ts
declare global {
  interface Window {
    onUploadStart?: (fileName: string, totalSize: number) => void;
    onUploadProgress?: (fileName: string, progress: number, bytesUploaded: number, bytesTotal: number) => void;
    onUploadComplete?: (fileName: string, success: boolean, errorMessage: string) => void;

    onDownloadStart?: (fileName: string, totalSize: number) => void;
    onDownloadProgress?: (fileName: string, progress: number, bytesDownloaded: number, bytesTotal: number) => void;
    onDownloadComplete?: (fileName: string, localUri: string, success: boolean, errorMessage: string) => void;
    onDownloadError?: (fileName: string, error: string) => void;
  }
}
export { }; // 确保文件被视为模块