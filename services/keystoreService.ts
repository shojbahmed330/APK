
import forge from 'node-forge';

export interface KeystoreConfig {
  keystore_base64?: string;
  keystore_password?: string;
  key_alias?: string;
  key_password?: string;
  [key: string]: any;
}

export class KeystoreService {
  /**
   * Validates if the project has enough data for a signed production build.
   */
  static isSigningReady(config: KeystoreConfig): boolean {
    return !!(
      config.keystore_base64 &&
      config.keystore_password &&
      config.key_alias &&
      config.key_password
    );
  }

  /**
   * Generates a unique alias based on the app name for better professionalism.
   */
  static generateCleanAlias(appName: string): string {
    const cleanName = (appName || 'app').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${cleanName}_key`;
  }

  /**
   * Generates instructions for the user if they don't have a keystore.
   */
  static getKeystoreCommand(packageName: string, appName: string): string {
    const alias = this.generateCleanAlias(appName);
    const fileName = alias.replace('_key', '.jks');
    return `keytool -genkey -v -keystore ${fileName} -keyalg RSA -keysize 2048 -validity 10000 -alias ${alias}`;
  }

  /**
   * Generates a real PKCS#12 keystore for mobile users with unique alias.
   */
  static generateInstantKeystore(appName: string) {
    const randomString = (len: number) => Math.random().toString(36).substring(2, 2 + len);
    const password = `studio_${randomString(8)}`;
    const alias = this.generateCleanAlias(appName);
    
    // Generate RSA key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);
    
    // Create a certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 25); // 25 years validity
    
    const attrs = [{
      name: 'commonName',
      value: appName || 'OneClick Studio App'
    }, {
      name: 'organizationName',
      value: 'OneClick Studio'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    // Self-sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());
    
    // Create PKCS#12
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey, [cert], password,
      { generateLocalKeyId: true, friendlyName: alias }
    );
    
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const base64Keystore = forge.util.encode64(p12Der);
    
    return {
      keystore_base64: `data:application/x-pkcs12;base64,${base64Keystore}`,
      keystore_password: password,
      key_alias: alias,
      key_password: password
    };
  }
}
