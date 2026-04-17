
import { cn } from "@/lib/utils";
import Image from "next/image";
import React from "react";
import logoPng from './logo.png';

export function Logo({ ...props }: Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'>) {
    return (
        <Image
            src={logoPng}
            alt="CanvasSync Logo"
            width={40}
            height={13}
            {...props}
        />
    );
}
