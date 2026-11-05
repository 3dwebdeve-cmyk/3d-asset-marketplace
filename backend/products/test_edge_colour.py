from io import BytesIO

from django.test import SimpleTestCase
from PIL import Image, ImageDraw

from products.edge_colour import sample_side_colours
from products.models import ProductImage
from products.serializers import ProductImageSerializer


def _png(width: int, height: int, draw) -> bytes:
    image = Image.new("RGB", (width, height), (0, 255, 0))
    draw(ImageDraw.Draw(image), width, height)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _rgb(hex_colour: str) -> tuple[int, int, int]:
    return tuple(int(hex_colour[index:index + 2], 16) for index in (1, 3, 5))


class SampleSideColoursTests(SimpleTestCase):
    def test_top_side_colours_are_sampled_and_muted(self) -> None:
        def draw(canvas, width, height):
            # Red down the left edge and blue down the right edge; the top band decides the colour.
            canvas.rectangle((0, 0, width // 10, height), fill=(255, 0, 0))
            canvas.rectangle((width - width // 10, 0, width, height), fill=(0, 0, 255))

        left, right, aspect_ratio = sample_side_colours(_png(200, 400, draw))

        assert aspect_ratio == 0.5
        left_red, left_green, left_blue = _rgb(left)
        assert left_red > left_green and left_red > left_blue
        assert left_red < 255  # muted, not the full red of the edge
        right_red, right_green, right_blue = _rgb(right)
        assert right_blue > right_red and right_blue > right_green
        assert right_blue < 255

    def test_bottom_of_the_edge_is_ignored(self) -> None:
        def draw(canvas, width, height):
            # The top band is white; only the bottom of the edge is black.
            canvas.rectangle((0, height // 2, width, height), fill=(0, 0, 0))
            canvas.rectangle((0, 0, width, height // 2), fill=(255, 255, 255))

        left, right, _ = sample_side_colours(_png(200, 400, draw))

        assert min(_rgb(left)) > 200
        assert min(_rgb(right)) > 200

    def test_unreadable_bytes_return_none(self) -> None:
        assert sample_side_colours(b"not an image") is None
        assert sample_side_colours(b"") is None


class ProductImageEdgeColoursSerializerTests(SimpleTestCase):
    def test_serializer_returns_colours_when_sampled(self) -> None:
        image = ProductImage(
            image_url="https://images.example.com/render.png",
            edge_left_color="#112233",
            edge_right_color="#445566",
            aspect_ratio=0.75,
        )

        data = ProductImageSerializer(image).data

        assert data["edge_colors"] == {"left": "#112233", "right": "#445566"}
        assert data["aspect_ratio"] == 0.75

    def test_serializer_returns_null_until_sampled(self) -> None:
        image = ProductImage(image_url="https://images.example.com/render.png")

        data = ProductImageSerializer(image).data

        assert data["edge_colors"] is None
        assert data["aspect_ratio"] is None
