"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function MemberBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: true,
        height: 60,
        margin: 8,
      });
    }
  }, [value]);

  return <svg ref={ref} />;
}
