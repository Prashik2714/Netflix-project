import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as config from "./config";

// Create a security group for allowing SSH access and all outbound traffic
const securityGroup = new aws.ec2.SecurityGroup(config.netflixenv, {
    vpcId: config.vpcid,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow SSH access"
        },
        {
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow port 8080 for Jenkins"
        },
        {
            protocol: "tcp",
            fromPort: 8081,
            toPort: 8081,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow port 8081 for Nexus/NetFlix Container"
        },
        {
            protocol: "tcp",
            fromPort: 9000,
            toPort: 9000,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow port 9000 for SonarQube"
        },
        {
            protocol: "tcp",
            fromPort: 9090,
            toPort: 9090,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow port 9090 for Prometheus"
        },
        {
            protocol: "tcp",
            fromPort: 3000,
            toPort: 3000,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow port 3000 for Grafana"
        },
        {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow HTTP access"
        },
        {
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow HTTPS access"
        }
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
            description: "Allow all outbound traffic"
        },
    ],
    tags: {
        Name: config.ec2netflix,
        Environment: config.netflixenv,
    },
});

// Create an EC2 instance with the defined key pair and volumes
const ec2Instance = new aws.ec2.Instance(config.netflixenv, {
    ami: config.imageid, // replace with the AMI ID of your choice
    instanceType: config.instanceType,
    keyName: config.keypair,
    rootBlockDevice: {
        volumeSize: config.rtvolumeSize,
        deleteOnTermination: true,
        volumeType: "gp3",
        tags: {
            Name: config.ec2netflix,
            Environment: config.netflixenv,
        },
    },
    ebsBlockDevices: [{
        deviceName: "/dev/sdb",
        volumeSize: config.dtvolumeSize,
        deleteOnTermination: true,
        volumeType: "gp3",
        tags: {
            Name: config.ec2netflix,
            Environment: config.netflixenv,
        },
    }],
    vpcSecurityGroupIds: [securityGroup.id],
    subnetId: config.subnetid,
    associatePublicIpAddress: true,
    userData: pulumi.interpolate`#!/bin/bash
    sudo apt-get update
    sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
      https://pkg.jenkins.io/debian/jenkins.io-2023.key
    echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc]" \
      https://pkg.jenkins.io/debian binary/ | sudo tee \
      /etc/apt/sources.list.d/jenkins.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y openjdk-17-jre-headless
    sudo apt-get install jenkins -y
    sudo systemctl enable jenkins
    sudo systemctl start jenkins
    sudo apt-get update
    sudo apt-get install docker.io -y
    sudo usermod -aG docker $USER
    sudo chmod 777 /var/run/docker.sock
    newgrp docker
    sudo systemctl enable docker
    sudo systemctl start docker
    git clone https://github.com/navinku/proNetflix.git
    cd proNetflix/
    docker build -t netflix .
    docker run -d --name sonar -p 9000:9000 sonarqube:lts-community
    sudo apt-get install wget apt-transport-https gnupg lsb-release
    sudo wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
    echo deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main | sudo tee -a /etc/apt/sources.list.d/trivy.list
    sudo apt-get update
    sudo apt-get install trivy -y
    `,
    tags: {
        Name: config.ec2netflix,
        Environment: config.netflixenv,
    },
});


// mkdir -p /home/ubuntu/.ssh
//     echo '${config.sshkey}' >> /home/ubuntu/.ssh/authorized_keys
//     chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys
//     chmod 600 /home/ubuntu/.ssh/authorized_keys

// echo $(sudo cat /var/lib/jenkins/secrets/initialAdminPassword)

// Export the public IP and instance ID of the EC2 instance
export const ec2netflixpubIp = ec2Instance.publicIp;
export const ec2netflixInstanceId = ec2Instance.id;

// Export the Jenkins admin URL using the public DNS of the EC2 instance
export const ec2netflixJenkinsAdminUrl = pulumi.interpolate`http://${ec2Instance.publicDns}:8080`;

// Create monitoring EC2 instance with the defined key pair and volumes
const monec2Instance = new aws.ec2.Instance(config.netflixenv + "-mon", {
    ami: config.imageid, // replace with the AMI ID of your choice
    instanceType: config.instanceType,
    keyName: config.keypair,
    rootBlockDevice: {
        volumeSize: config.rtvolumeSize,
        deleteOnTermination: true,
        volumeType: "gp3",
        tags: {
            Name: config.ec2netflix + "-Monitoring",
            Environment: config.netflixenv,
        },
    },
    vpcSecurityGroupIds: [securityGroup.id],
    subnetId: config.subnetid,
    associatePublicIpAddress: true,
    userData: pulumi.interpolate`#!/bin/bash
    sudo apt-get update
    sudo useradd --system --no-create-home --shell /bin/false prometheus
    sudo wget https://github.com/prometheus/prometheus/releases/download/v2.47.1/prometheus-2.47.1.linux-amd64.tar.gz
    tar -xvf prometheus-2.47.1.linux-amd64.tar.gz
    cd prometheus-2.47.1.linux-amd64/
    sudo mkdir -p /data /etc/prometheus
    sudo mv prometheus promtool /usr/local/bin/
    sudo mv consoles/ console_libraries/ /etc/prometheus/
    sudo mv prometheus.yml /etc/prometheus/prometheus.yml
    sudo chown -R prometheus:prometheus /etc/prometheus/ /data/
    # Clean up temporary files
    rm -rf /tmp/prometheus-2.47.1.linux-amd64*

    # Create a systemd service for Prometheus
    sudo bash -c 'cat << EOF > /etc/systemd/system/prometheus.service
    [Unit]
    Description=Prometheus
    Wants=network-online.target
    After=network-online.target

    StartLimitIntervalSec=500
    StartLimitBurst=5

    [Service]
    User=prometheus
    Group=prometheus
    Type=simple
    Restart=on-failure
    RestartSec=5s
    ExecStart=/usr/local/bin/prometheus \\
    --config.file=/etc/prometheus/prometheus.yml \\
    --storage.tsdb.path=/data \\
    --web.console.templates=/etc/prometheus/consoles \\
    --web.console.libraries=/etc/prometheus/console_libraries \\
    --web.listen-address=0.0.0.0:9090 \\
    --web.enable-lifecycle

    [Install]
    WantedBy=multi-user.target
    EOF'

    # Enable and start Prometheus service
    sudo systemctl enable prometheus
    sudo systemctl start prometheus
    
    sudo useradd --system --no-create-home --shell /bin/false node_exporter
    sudo wget https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz
    tar -xvf node_exporter-1.6.1.linux-amd64.tar.gz
    sudo mv node_exporter-1.6.1.linux-amd64/node_exporter /usr/local/bin/
    rm -rf node_exporter*

    # Create a systemd service for Node Exporter
    sudo bash -c 'cat << EOF > /etc/systemd/system/node_exporter.service
    [Unit]
    Description=Node Exporter
    Wants=network-online.target
    After=network-online.target
    
    [Service]
    User=node_exporter
    Group=node_exporter
    Type=simple
    ExecStart=/usr/local/bin/node_exporter
    
    [Install]
    WantedBy=default.target
    EOF'

    sudo systemctl enable node_exporter
    sudo systemctl start node_exporter

    sudo apt-get update
    sudo apt-get install -y apt-transport-https software-properties-common
    sudo wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
    echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
    sudo apt-get update
    sudo apt-get -y install grafana
    sudo systemctl enable grafana-server
    sudo systemctl start grafana-server
    `,
    tags: {
        Name: config.ec2netflix + "-Monitoring",
        Environment: config.netflixenv,
    },
});

// Export the public IP and instance ID of the EC2 instance
export const monec2netflixpubIp = monec2Instance.publicIp;