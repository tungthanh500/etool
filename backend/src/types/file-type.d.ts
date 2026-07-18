// "file-type" (v22+) chỉ phát hành ESM, moduleResolution "node" hiện tại của dự án
// không tự resolve được type declarations của nó qua node_modules — chỉ khai báo lại
// đúng phần thực dùng (dynamic import trong lib/upload.ts), không ảnh hưởng dự án khác.
declare module "file-type" {
  export interface FileTypeResult {
    ext: string;
    mime: string;
  }
  export function fileTypeFromFile(path: string): Promise<FileTypeResult | undefined>;
}
