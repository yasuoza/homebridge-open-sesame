// See more https://github.com/allan-stewart/node-aes-cmac

declare module "node-aes-cmac" {
  export function aesCmac(
    key: string | Buffer,
    message: string | Buffer,
    options?: { returnAsBuffer: false },
  ): string;

  export function aesCmac(
    key: string | Buffer,
    message: string | Buffer,
    options: { returnAsBuffer: true },
  ): Buffer;
}
