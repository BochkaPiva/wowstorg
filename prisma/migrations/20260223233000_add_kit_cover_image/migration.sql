-- Add optional cover image URL for kit cards in Mini App.
ALTER TABLE "kits"
ADD COLUMN "cover_image_url" TEXT;
