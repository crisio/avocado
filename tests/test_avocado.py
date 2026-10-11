import subprocess
import sys
import unittest

import avocado


class AvocadoTestCase(unittest.TestCase):
    def test_version_and_helpers(self):
        self.assertEqual(avocado.__version__, "0.1.0")
        self.assertEqual(avocado.avocado("avocado"), "avocado")
        self.assertEqual(
            avocado.describe("avocado"),
            "avocado is a nutrient-dense fruit with a creamy texture.",
        )
        self.assertTrue(avocado.is_avocado("Avocado"))
        self.assertEqual(avocado.make_avocado("hass")["kind"], "hass")

    def test_cli(self):
        result = subprocess.run(
            [sys.executable, "-m", "avocado", "avocado", "--count", "2"],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(
            result.stdout.strip().splitlines(),
            [
                "avocado is a nutrient-dense fruit with a creamy texture.",
                "avocado is a nutrient-dense fruit with a creamy texture.",
            ],
        )


if __name__ == "__main__":
    unittest.main()
