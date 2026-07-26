package id.createimpact.kasirku;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(KitchenPrinterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
