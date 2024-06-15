import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
export const vpcid = config.require("vpcid");
export const subnetid = config.require("subnetid");
export const keypair = config.require("keypair");
// export const privateKey = config.requireSecret("privateKey");  // Use requireSecret for sensitive data


//s3 bucket values

//netflix values
export const netflixenv = "netflixenv";
export const imageid = "ami-04b70fa74e45c3917"; //Canonical, Ubuntu, 24.04 LTS 
export const instanceType = "t3a.large";
export const rtvolumeSize = 30;
export const dtvolumeSize = 10;
export const ec2netflix = "ec2netflix";