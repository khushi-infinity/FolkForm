import React, { useState } from 'react';
import { Layers } from 'lucide-react';

interface CraftImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  aspectClass?: string;
}

export const CraftImage: React.FC<CraftImageProps> = ({
  src,
  alt,
  className = '',
  aspectClass = 'aspect-[4/3]',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${aspectClass} w-full bg-gradient-to-br from-[#E9DCC7] via-[#F4ECDE] to-[#DFCEB2] flex flex-col items-center justify-center p-6 text-center text-[#3A2319]/70 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Layers className="w-6 h-6 text-[#B05330]/70 mb-2" strokeWidth={1.5} />
        <span className="font-serif text-base text-[#3A2319]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};
